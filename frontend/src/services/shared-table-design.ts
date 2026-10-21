import {apiGet,apiPatch,ApiError,type ApiResponse} from "./api.service";
export type CellDesign={bold?:boolean;italic?:boolean;underline?:boolean;color?:string|null;backgroundColor?:string|null;fontSize?:number|null;fontFamily?:string|null};
export type HeaderDesign=Pick<CellDesign,"color"|"backgroundColor"|"fontSize">;
export type ConfiguredInput={type:"TEXT"|"NUMBER"|"DATE"|"DROPDOWN";options?:Array<{value:string;label:string;color:string|null;active:boolean}>};
export type ColumnDesign={alias?:string|null;combined?:boolean;input?:ConfiguredInput;header?:HeaderDesign;hidden?:boolean;position?:number;pin?:"left"|"right"|null;color?:string|null;alignment?:"left"|"center"|"right"|null;format?:CellDesign;cells?:Record<string,CellDesign|null>};
type Row={table_key?:string;updated_at?:string;updated_by?:string|null;column_key:string;revision:number;width_px:number;design:ColumnDesign};
export type DesignSnapshot={columns:Record<string,ColumnDesign>;loaded:boolean;saving:boolean;error:string};
type Layout={order:string[];hidden:string[];colors?:Record<string,string>;pins?:Record<string,"left"|"right">};
export function designLayout<T extends Layout>(local:T,keys:readonly string[],columns:Record<string,ColumnDesign>,loaded:boolean):T{
 // Browser-local legacy colors/pins are never an authoritative shared snapshot.
 if(!loaded)return {...local,order:[...keys],hidden:[],colors:{},pins:{}};
 return {...local,order:[...keys].sort((a,b)=>(columns[a]?.position??1001)-(columns[b]?.position??1001)),hidden:keys.filter(k=>columns[k]?.hidden),colors:Object.fromEntries(keys.flatMap(k=>columns[k]?.color?[[k,columns[k].color]]:[])),pins:Object.fromEntries(keys.flatMap(k=>columns[k]?.pin?[[k,columns[k].pin]]:[]))} as T;
}
export function designChanges(before:Layout,after:Layout){const patches:Record<string,ColumnDesign>={},reordered=before.order.join("\u0000")!==after.order.join("\u0000");for(const [position,key] of after.order.entries()){const patch:ColumnDesign={};if(reordered)patch.position=position;if(before.hidden.includes(key)!==after.hidden.includes(key))patch.hidden=after.hidden.includes(key);if((before.colors?.[key]??null)!==(after.colors?.[key]??null))patch.color=after.colors?.[key]??null;if((before.pins?.[key]??null)!==(after.pins?.[key]??null))patch.pin=after.pins?.[key]??null;if(Object.keys(patch).length)patches[key]=patch;}return patches;}
export const emptyDesign:DesignSnapshot={columns:{},loaded:false,saving:false,error:""};
type Entry={fetchedAt?:number;active:boolean;epoch:number;rows:Map<string,Row>;drafts:Map<string,{patch:ColumnDesign;width:number}>;listeners:Set<()=>void>;snapshot:DesignSnapshot;request?:Promise<void>;write?:Promise<void>};
const entries=new Map<string,Entry>();
const endpoint=(table:string)=>`/table-layouts/${encodeURIComponent(table)}/design`;
function entry(token:string,table:string){const key=`${token}:${table}`;if(!entries.has(key))entries.set(key,{active:true,epoch:0,rows:new Map(),drafts:new Map(),listeners:new Set(),snapshot:emptyDesign});return entries.get(key)!;}
function merge(base:ColumnDesign,patch:ColumnDesign,keepTombstones=false):ColumnDesign{
 const cells=patch.cells?{...base.cells,...patch.cells}:undefined;
 if(cells)for(const [key,value] of Object.entries(patch.cells??{})){if(value===null){if(keepTombstones)cells[key]=null;else delete cells[key];}else cells[key]={...base.cells?.[key],...value};}
 return {...base,...patch,...(patch.header?{header:{...base.header,...patch.header}}:{}),...(patch.format?{format:{...base.format,...patch.format}}:{}),...(cells?{cells}:{})};
}
export const mergeColumnDesign = merge;
export const mergeDesignPatches=(base:ColumnDesign,patch:ColumnDesign)=>merge(base,patch,true);
function publish(e:Entry,error=e.snapshot.error){if(!e.active)return;const columns=Object.fromEntries([...e.rows].map(([k,v])=>[k,v.design??{}]));for(const [k,v] of e.drafts)columns[k]=merge(columns[k]??{},v.patch);const next={...e.snapshot,columns,saving:Boolean(e.write),error};if(JSON.stringify(next)===JSON.stringify(e.snapshot))return;e.snapshot=next;e.listeners.forEach(fn=>fn());}
export const readSharedDesign=(token:string,table:string)=>entry(token,table).snapshot;
/** Confirmed metadata only, excluding optimistic drafts (e.g. before choosing a new option). */
export const confirmedColumnDesign=(token:string,table:string,column:string)=>entry(token,table).rows.get(column)?.design;
export function subscribeSharedDesign(token:string,table:string,fn:()=>void){const e=entry(token,table);e.listeners.add(fn);return()=>{e.listeners.delete(fn);};}
export function clearSharedDesign(){for(const e of entries.values()){e.active=false;e.epoch++;e.listeners.clear();}entries.clear();}
export async function refreshSharedDesign(token:string,table:string,force=false){
 const e=entry(token,table);if(e.request)return e.request;if(!force&&e.snapshot.loaded&&Date.now()-(e.fetchedAt??0)<10000)return;const epoch=e.epoch;
 e.request=apiGet<ApiResponse<Row[]>>(endpoint(table),token).then(response=>{
  if(!response.success||!Array.isArray(response.data))throw Error("Shared design response was invalid.");
  if(!e.active)return;
  for(const row of response.data){if(row.revision>=(e.rows.get(row.column_key)?.revision??0))e.rows.set(row.column_key,row);}
  e.fetchedAt=Date.now();e.snapshot={...e.snapshot,loaded:true};publish(e,e.drafts.size?e.snapshot.error:"");
 }).catch(error=>{if(epoch===e.epoch)publish(e,error instanceof Error?error.message:"Shared design could not be loaded.");}).finally(()=>{e.request=undefined;});return e.request;
}
/** Widths and appearance are the same versioned database row. Share its
 * authorized read rather than fetching the row from two endpoints. */
export async function readSharedLayoutRows(token:string,table:string,force=false){
 await refreshSharedDesign(token,table,force);
 const e=entry(token,table);
 if(!e.snapshot.loaded||e.snapshot.error)throw Error(e.snapshot.error||"Shared layout could not be loaded.");
 return [...e.rows.values()];
}
export function saveSharedDesign(token:string,table:string,column:string,patch:ColumnDesign,width:number){const e=entry(token,table);const current=e.drafts.get(column);e.drafts.set(column,{patch:mergeDesignPatches(current?.patch??{},patch),width});e.epoch++;publish(e,"");return retrySharedDesign(token,table);}
/** Queue the complete physical-key order before starting the existing revisioned writer. */
export function saveSharedColumnOrder(token: string, table: string, keys: readonly string[], width: (key: string) => number) {
 const e = entry(token, table);
 if (keys.length > 1001 || new Set(keys).size !== keys.length) { publish(e, "Invalid column order. No layout was saved."); return Promise.resolve(); }
 let changed = false;
 keys.forEach((column, position) => {
  const pending = e.drafts.get(column);
  if ((pending?.patch.position ?? e.rows.get(column)?.design?.position) === position) return;
  e.drafts.set(column, { patch: mergeDesignPatches(pending?.patch ?? {}, { position }), width: width(column) });
  changed = true;
 });
 if (!changed) return Promise.resolve();
 e.epoch++; publish(e, "");
 return retrySharedDesign(token, table);
}
export function retrySharedDesign(token:string,table:string){
 const e=entry(token,table);if(e.write)return e.write;
 e.write=Promise.resolve().then(async()=>{
  await e.request;await refreshSharedDesign(token,table,true);if(!e.active)return;if(!e.snapshot.loaded)throw Error(e.snapshot.error||"Shared design is unavailable.");
  while(e.active&&e.drafts.size){const [column,draft]=e.drafts.entries().next().value!;
   const canonical=e.rows.get(column)?.design;
   if(canonical&&JSON.stringify(merge(canonical,draft.patch))===JSON.stringify(canonical)){if(e.drafts.get(column)===draft)e.drafts.delete(column);publish(e,"");continue;}
   e.epoch++;
   // Widths and design share the same revision. Rebase only this patch on a
   // fresh revision after a concurrent resize/design save, never replace metadata.
   let response:ApiResponse<Row>|undefined;
   for(let attempt=0;attempt<3;attempt++){
    try{
     const revision=e.rows.get(column)?.revision??0;
     response=await apiPatch<ApiResponse<Row>>(`${endpoint(table)}/${encodeURIComponent(column)}`,{patch:draft.patch,initial_width_px:Math.max(60,Math.min(1600,Math.round(draft.width))),expected_revision:revision},token);
     if(!response.success||!response.data||response.data.column_key!==column||response.data.revision<=revision||!response.data.design||typeof response.data.design!=="object"||JSON.stringify(merge(response.data.design,draft.patch))!==JSON.stringify(response.data.design))throw Error("Server did not confirm the shared design.");
     break;
    }catch(error){
     if(!(error instanceof ApiError)||error.status!==409||attempt===2)throw error;
     await refreshSharedDesign(token,table,true);
    }
   }
   if(!response?.data)throw Error("Server did not confirm the shared design.");
   if(!e.active)return;if(!response.success||!response.data||response.data.column_key!==column)throw Error("Server did not confirm the shared design.");
   e.epoch++;e.rows.set(column,response.data);if(e.drafts.get(column)===draft)e.drafts.delete(column);publish(e,"");
  }
 }).catch(error=>publish(e,`${error instanceof Error?error.message:"Save failed."} Design changes remain unsaved; retry.`)).finally(()=>{e.write=undefined;publish(e);});publish(e);return e.write;
}
