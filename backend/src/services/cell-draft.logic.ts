import { canViewTable, management, SOURCE_FIELDS } from "./collaboration.logic.js";
import { isValidUuid } from "../utils/validation.js";
import { DRAFT_REPORT_FIELDS } from "../config/cell-draft-fields.js";
export type DraftTarget={table:string;source:string;recordId:string;field:string;tripId?:string;stopId?:string;reportId?:string};
export type DraftPacket={target:DraftTarget;sessionId:string;sequence:number;value:string;phase:"editing"|"saving"|"failed"};
export const DRAFT_EXTRA_FIELDS:Record<string,readonly string[]>={
 loading_reports:["warehouse_arrival_at","loading_start_at","loading_finished_at"],
 // item.* addresses the unique empty standalone child slot by physical parent,
 // before an item row exists. Never use a browser-generated pending item UUID.
 offloads:["reason","comments","number_of_boxes","reported_at","item.quantity","item.total_cbm"],backloads:["reason","comments","number_of_boxes"],
 offload_items:["quantity","total_cbm"],flex_columns:["value"],
};
// Drafts must be editable business values, not arbitrary columns or credentials.
const protectedFields=new Set(["trip_number","added_to_report","stop_sequence","assigned_at","unassigned_at","assignment_type"]);
export function draftKey(t:DraftTarget){return JSON.stringify([t.table,t.source,t.recordId,t.field,t.source==="flex_columns"?t.stopId??null:null]);}
export function parseDraftPacket(input:unknown,role:string):DraftPacket{
 if(!management(role)||!input||typeof input!=="object"||Array.isArray(input))throw Error("Draft access denied");
 const p=input as Record<string,unknown>,t=p.target as Record<string,unknown>;
 if(Object.keys(p).some(k=>!["target","sessionId","sequence","value","phase"].includes(k))||!t||typeof t!=="object"||Array.isArray(t)||Object.keys(t).some(k=>!["table","source","recordId","field","tripId","stopId","reportId"].includes(k)))throw Error("Invalid draft");
 if(typeof t.table!=="string"||!canViewTable(role,t.table)||!(["trips","combined","dispatch-monitoring","dispatch","trip-booking","store-calling","operations","transmittal-tracker"].includes(t.table)||t.table.startsWith("flex:")))throw Error("Invalid draft table");
 const fields=typeof t.source==="string"?(Object.hasOwn(DRAFT_EXTRA_FIELDS,t.source)?DRAFT_EXTRA_FIELDS[t.source]:Object.hasOwn(SOURCE_FIELDS,t.source)?SOURCE_FIELDS[t.source]:undefined):undefined;
 if(!fields||typeof t.field!=="string"||!fields.includes(t.field)||protectedFields.has(t.field)||typeof t.recordId!=="string"||!isValidUuid(t.recordId))throw Error("Invalid draft cell");
 if(t.source!=="flex_columns"&&!DRAFT_REPORT_FIELDS[String(t.table)]?.[String(t.source)]?.includes(t.field))throw Error("Field not editable in this report");
 if(t.source==="flex_columns"&&(!t.stopId||!t.tripId))throw Error("Missing bound cell identity");
 if(t.source==="flex_columns"&&!["combined","dispatch-monitoring","dispatch","trip-booking","store-calling","trips","transmittal-tracker"].includes(t.table))throw Error("Invalid bound report");
 if(["offloads","backloads","offload_items"].includes(String(t.source))&&t.table!=="operations")throw Error("Invalid report source");
 for(const name of ["tripId","stopId","reportId"])if(t[name]!==undefined&&(typeof t[name]!=="string"||!isValidUuid(t[name] as string)))throw Error("Invalid parent");
 if(typeof p.sessionId!=="string"||!isValidUuid(p.sessionId)||!Number.isSafeInteger(p.sequence)||Number(p.sequence)<1||typeof p.value!=="string"||Buffer.byteLength(p.value,"utf8")>8192||!["editing","saving","failed"].includes(String(p.phase)))throw Error("Invalid draft size or sequence");
 return p as unknown as DraftPacket;
}
