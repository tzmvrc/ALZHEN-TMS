import { isValidUuid } from "../utils/validation.js";
export const COLLAB_TABLES = ["trips","combined","dispatch-monitoring","dispatch","trip-booking","store-calling"] as const;
export const SOURCE_FIELDS: Record<string,readonly string[]> = {
 trips:["dispatch_number","transaction_number","trip_number","loading_date","estimated_delivery_date","status","remarks","trip_type_id","warehouse_id","added_to_report","letter_status","truck_allocated_by","subcon_rate_manual","signed_dr_upload_date","transmittal_date","tms_date","tms_done_by","pod_ac_shipping_date","lbc_tracking_number"],
 trip_stops:["dispatch_number","transaction_number","dr_number","quantity","total_cbm","stop_sequence","customer_id","store_id","delivery_status","arrival_time","start_unloading_time","finish_unloading_time","departure_time","remarks"],
 trip_line_items:["product_id","dr_number","quantity","cbm","sap_so_number","customer_po_number","internal_po_number","customer_model","remarks"],
 trip_truck_assignments:["truck_id","driver_id","trucking_company_id","assignment_type","assigned_at","unassigned_at","remarks"],
 store_calls:["assigned_to","contact_id","contact_name","contact_number","status","confirmation_status","date_assigned","date_of_contact","time_texted","time_called","remarks"],
 billings:["invoice_number"],
};
export type CellTarget = {table:string;source:string;recordId:string;tripId?:string;stopId?:string;field:string;status:"selected"|"editing"};
export type Commit = {eventId:string;source:string;recordId:string;tripId?:string;stopId?:string;fields:string[];version:number|null;actorId:string|null;operation?:"INSERT"|"UPDATE"|"DELETE"};
export function parseCellTarget(value:unknown):CellTarget {
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid cell");
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(key=>!["table","source","recordId","tripId","stopId","field","status"].includes(key)))throw Error("Unexpected presence field");
 if(!(COLLAB_TABLES as readonly unknown[]).includes(v.table)||typeof v.source!=="string"||!Object.hasOwn(SOURCE_FIELDS,v.source)||!SOURCE_FIELDS[v.source].includes(String(v.field))||typeof v.recordId!=="string"||!isValidUuid(v.recordId)||!["selected","editing"].includes(String(v.status)))throw Error("Invalid cell identity");
 for(const key of ["tripId","stopId"])if(v[key]!==undefined&&(typeof v[key]!=="string"||!isValidUuid(v[key] as string)))throw Error("Invalid parent identity");
 return v as CellTarget;
}
export function validVersion(value:unknown):number|null {return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;}
export function collaborationColor(id:string){let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;return `hsl(${hash%3600/10} 65% 38%)`;}
export function management(role:string){return role==="ADMIN"||role==="STAFF";}
