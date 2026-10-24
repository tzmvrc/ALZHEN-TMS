import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { REPORT_DEFINITIONS } from "../config/reports.js";
import { getReportData } from "./report.service.js";
import { getTracker, trackerDraftColumns } from "./transmittal-tracker.service.js";
import { getTripOperations } from "./operations-report.service.js";
import { isValidUuid } from "../utils/validation.js";
import { postgrestBatches } from "../utils/postgrest-batches.js";
import {MASTER_LIST_COLUMNS} from "../config/master-list-columns.js";
import {TRIP_SOURCE_COLUMNS,TRIP_CARGO_COLUMNS,SOURCE_LINE_COLUMNS} from "../config/trip-source-columns.js";
import { validateFormulaSyntax, formulaReferenceAddresses, physicalRowIdentity } from "../../../packages/spreadsheet-formula/index.js";
type Actor={profileId:string;role:string};
type Row=Record<string,any>;
const TRACKER=["assigned_plate_number","driver_name","warehouse_code","delivered_to","plate_number","delivery_receipt_no","sales_order_no","transmittal_ref","date_created","status","lbc_waybill_no","shipping_date_via_lbc","remarks"];
const OPERATIONS=["date","trip","plate_number","driver_name","route","dr_number","quantity","total_cbm","report_type","remarks","reported_by"];
function authorize(actor:Actor,table:unknown):string {if(!["ADMIN","STAFF"].includes(actor.role))throw new ApiError("Formula access denied.",403);if(typeof table!=="string"||!(table==="trips"||table==="operations"||table==="transmittal-tracker"||table.startsWith("report:")&&Object.hasOwn(REPORT_DEFINITIONS,table.slice(7))))throw new ApiError("Unknown formula table.",400);return table;}
function columns(table:string):string[]{return table==="operations"?OPERATIONS:table==="transmittal-tracker"?TRACKER:[...new Set([...(table==="trips"?[...MASTER_LIST_COLUMNS,...REPORT_DEFINITIONS["dispatch-monitoring"].columns]:REPORT_DEFINITIONS[table.slice(7)].columns),...TRIP_SOURCE_COLUMNS,...TRIP_CARGO_COLUMNS,...(table==="trips"?SOURCE_LINE_COLUMNS:[])].map(c=>c.key))];}
function identities(input:unknown):string[]{if(!Array.isArray(input)||input.length>500||input.some(id=>typeof id!=="string"||id.length>1000||!id||!/^[a-zA-Z0-9:_-]+$/.test(id)))throw new ApiError("Select at most 500 physical rows.",400);return [...new Set(input)] as string[];}
/** Read only this dependency graph, never every overlay in the sheet. */
async function dependencyFormulas(table:string,requested:string[]){
 const rows:Row[]=[],visited=new Set<string>();let pending=[...requested];
 while(pending.length){const batch=[...new Set(pending)].filter(id=>!visited.has(id));pending=[];
  if(visited.size+batch.length>500)throw new ApiError("Formula dependencies exceed 500 physical rows.",400);
  for(const id of batch)visited.add(id);
  for(const ids of postgrestBatches(batch)){
   for(let offset=0;;offset+=1000){const result=await supabaseAdmin.from("spreadsheet_cell_formulas").select("*").eq("table_key",table).in("row_identity",ids).order("id").range(offset,offset+999);
    if(result.error)throw new ApiError("Formula storage could not be read. Retry without discarding your draft.",503,"FORMULA_STORAGE_UNAVAILABLE");
    for(const row of result.data??[]){rows.push(row);if(!row.is_deleted)for(const ref of Object.values(row.reference_bindings??{}) as Array<{rowId:string}>)if(!visited.has(ref.rowId))pending.push(ref.rowId);}
    if(rows.length>5000)throw new ApiError("Formula dependency graph is too large.",400);
    if((result.data?.length??0)<1000)break;
   }
  }
 }
 return rows;
}
async function sourceRows(actor:Actor,table:string,ids:string[]):Promise<Map<string,Row>> {
 const result=new Map<string,Row>();if(!ids.length)return result;
 if(table==="transmittal-tracker"){const stopIds=ids.map(id=>{const match=/^stop:([0-9a-f-]{36})(?::assignment:([0-9a-f-]{36}))?$/i.exec(id);if(!match||!isValidUuid(match[1]))throw new ApiError("Invalid physical Tracker reference.",400);return match[1];});const tracker=await getTracker({id:actor.profileId,role:actor.role},undefined,undefined,undefined,stopIds);for(const row of tracker.rows){const key=`stop:${row.trip_stop_id}${row.assignment_id?`:assignment:${row.assignment_id}`:""}`;if(ids.includes(key))result.set(key,row)};return result;}
 const tripIds=new Set<string>(),lookups=new Map<string,string[]>();
 for(const identity of ids){const match=/^trip:([0-9a-f-]{36})(?::|$)/i.exec(identity);if(match&&isValidUuid(match[1])){tripIds.add(match[1]);continue;}
  const event=/^event:(LOADING|UNLOADING|OFFLOAD|BACKLOAD):([0-9a-f-]{36})$/i.exec(identity);
  const simple=/^(store-call|pod):([0-9a-f-]{36})(?::assignment:[0-9a-f-]{36})?$/i.exec(identity);
  const source=event?({LOADING:"loading_reports",UNLOADING:"unloading_reports",OFFLOAD:"offloads",BACKLOAD:"backloads"} as Record<string,string>)[event[1].toUpperCase()]:simple?.[1]==="pod"?"pod_records":simple?"store_calls":null;
  if(!source)throw new ApiError("Invalid physical formula row.",400);
  const sourceIds=lookups.get(source)??[];sourceIds.push(event?.[2]??simple![2]);lookups.set(source,sourceIds);
 }
 for(const [source,sourceIds] of lookups)for(let index=0;index<sourceIds.length;index+=100){const records=await supabaseAdmin.from(source).select("trip_id").in("id",sourceIds.slice(index,index+100));if(records.error)throw new ApiError("Unable to verify formula references.",503);for(const record of records.data??[])if(record.trip_id)tripIds.add(record.trip_id);}
 if(!tripIds.size)return result;
 if(tripIds.size>100)throw new ApiError("Narrow the formula reference set.",400);
 for(const tripId of table==="operations"?tripIds:["batched"]){if(table==="operations"){const source=await getTripOperations(actor,tripId).catch(error=>{if(error instanceof ApiError&&error.statusCode===404)return null;throw error;});if(!source)continue;for(const row of source.event_rows){const id=physicalRowIdentity(row);if(id&&ids.includes(id))result.set(id,{...row,trip:row.dispatch_number??row.trip_number,report_type:row.report_types.join(", ")});}continue;}
  const callIds=table==="report:store-calling"?lookups.get("store_calls")??[]:[];
  const scopes=callIds.length?Array.from({length:Math.ceil(callIds.length/100)},(_,i)=>({storeCallIds:callIds.slice(i*100,i*100+100)})):[{tripIds:[...tripIds]}];
  const lineProjection=table==="trips"&&ids.some(id=>id.includes(":line:"));
  for(const scope of scopes)for(let page=1;page<=20;page++){const source=await getReportData(table==="trips"?"dispatch-monitoring":table.slice(7),{page,limit:500,...(lineProjection?{source_lines:"true"}:{})},scope);for(const row of source.rows){const id=physicalRowIdentity(row);if(id&&ids.includes(id)){if(result.has(id))throw new ApiError("The report has ambiguous physical rows.",409);result.set(id,row);}}if(page>=source.pagination.totalPages)break;if(page===20)throw new ApiError("Narrow the formula reference set.",400);}
 }
 return result;
}
export async function readSpreadsheetFormulas(actor:Actor,input:Row){const table=authorize(actor,input.table_key),requested=identities(input.rows),all=await dependencyFormulas(table,requested),requestedSet=new Set(requested),needed=new Set(all.filter(formula=>requestedSet.has(formula.row_identity)).map(formula=>String(formula.row_identity)));
 // Visible source values already came from the authorized report API. With no
 // saved overlay there is no dependency data to read, validate, or disclose.
 if(!needed.size)return {formulas:[],sources:[]};
 let changed=true;while(changed){changed=false;for(const formula of all){if(!needed.has(formula.row_identity)||formula.is_deleted)continue;for(const ref of Object.values(formula.reference_bindings) as Array<{rowId:string}>){if(!needed.has(ref.rowId)){needed.add(ref.rowId);changed=true;}}}if(needed.size>500)throw new ApiError("Formula dependencies exceed 500 physical rows.",400);}
 const source=await sourceRows(actor,table,[...needed]);const keys=columns(table);
 return {formulas:all.filter(row=>needed.has(row.row_identity)&&source.has(row.row_identity)),sources:[...source].map(([id,row])=>({id,values:Object.fromEntries(keys.map(key=>[key,row[key]??null]))}))};}
export async function saveSpreadsheetFormulas(actor:Actor,input:Row){const table=authorize(actor,input.table_key);if(!Array.isArray(input.changes)||input.changes.length<1||input.changes.length>50)throw new ApiError("Save 1 to 50 formula cells per batch.",400);if(table==="transmittal-tracker")await trackerDraftColumns({id:actor.profileId,role:actor.role});const keys=new Set(columns(table)),needed=new Set<string>(),targets=new Set<string>();
 const changes=input.changes.map((change:Row)=>{if(!change||typeof change!=="object"||Array.isArray(change)||Object.keys(change).some(key=>!["row_identity","column_key","expression","references","expected_version"].includes(key)))throw new ApiError("Invalid formula change.",400);const row=identities([change.row_identity])[0];if(!keys.has(change.column_key)||!Number.isInteger(change.expected_version)||change.expected_version<0)throw new ApiError("Invalid formula column or version.",400);const key=`${row}\0${change.column_key}`;if(targets.has(key))throw new ApiError("Duplicate formula target.",400);targets.add(key);needed.add(row);
  if(change.expression!==null){if(typeof change.expression!=="string"||change.expression.length>2000)throw new ApiError("Enter a bounded formula expression.",400);try{validateFormulaSyntax(change.expression);}catch{throw new ApiError("Invalid formula expression.",400);}if(!change.references||typeof change.references!=="object"||Array.isArray(change.references)||Object.keys(change.references).length>1000||Buffer.byteLength(JSON.stringify(change.references))>131072)throw new ApiError("Invalid formula bindings.",400);
   // Enumerate expression references with the shared parser, without using browser row indices as permanent IDs.
   const expected=new Set<string>();try{formulaReferenceAddresses(change.expression).forEach(key=>expected.add(key));}catch{throw new ApiError("Formula references exceed the supported address range.",400);}
   if(expected.size!==Object.keys(change.references).length)throw new ApiError("Formula bindings do not match the expression.",400);
   for(const [address,ref] of Object.entries(change.references) as Array<[string,Row]>){if(!expected.has(address)||!ref||typeof ref!=="object"||Object.keys(ref).some(k=>!["rowId","columnId"].includes(k))||!keys.has(ref.columnId))throw new ApiError("Invalid formula reference.",400);needed.add(identities([ref.rowId])[0]);}
  }
  return {...change,references:change.expression===null?{}:change.references};});
 if(needed.size>500)throw new ApiError("Formula batch references too many rows.",400);const source=await sourceRows(actor,table,[...needed]);if([...needed].some(id=>!source.has(id)))throw new ApiError("A formula row or reference was deleted or is unavailable.",409,"FORMULA_REFERENCE_UNAVAILABLE");
 const result=await supabaseAdmin.rpc("save_spreadsheet_formulas_v1",{p_actor:actor.profileId,p_table:table,p_changes:changes}).retry(false);if(result.error)throw new ApiError(["40001","PT409"].includes(result.error.code)?"Another user changed a formula. Your draft is retained; refresh and retry.":result.error.code==="23514"?"Circular or excessively deep formula dependencies are not allowed.":"Unable to save the formula batch. Nothing was saved.",["40001","PT409"].includes(result.error.code)?409:400,"FORMULA_SAVE_FAILED");return result.data;
}
