import type { ReportKey, ReportRow } from "./report.service";
import { lineItemDeletionTargets } from "./trip.service";

/** A projected row is deletable only when it names an exact cargo child.
 * Calls, incidents and stop-only projections never fall back to parent deletion.
 */
export function reportLineItemDeletionTargets(report: ReportKey, rows: ReportRow[]) {
  if (report === "store-calling" || rows.some(row =>
    ["incident_id", "backload_id", "offload_id"].some(field => row[field] || row[`_${field}`]))) return null;
  return lineItemDeletionTargets(rows);
}

export type PhysicalDeletionTarget={source:"store_calls"|"trip_stops";id:string;tripId:string;version:number};
const uuid=(x:unknown):x is string=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function physicalDeletionTargets(report:ReportKey,rows:ReportRow[],capabilities:{storeCalls:boolean;emptyStops:boolean}):PhysicalDeletionTarget[]|null{
 const unique=new Map<string,PhysicalDeletionTarget>();if(!rows.length)return null;
 for(const row of rows){const source=report==="store-calling"?"store_calls":"trip_stops";
  if(source==="store_calls"?!capabilities.storeCalls:!capabilities.emptyStops)return null;
  if(source==="trip_stops"&&["trip_line_item_id","_trip_line_item_id","incident_id","_incident_id","offload_id","_offload_id","backload_id","_backload_id"].some(key=>row[key]))return null;
  const id=source==="store_calls"?row.store_call_id??row._store_call_id:row.trip_stop_id??row._trip_stop_id,tripId=row.trip_id??row._trip_id,version=row[source==="store_calls"?"_store_call_version":"_stop_version"];
  if(!uuid(id)||!uuid(tripId)||!Number.isSafeInteger(version)||Number(version)<0)return null;
  const prior=unique.get(id);if(prior&&(prior.tripId!==tripId||prior.version!==version))return null;
  unique.set(id,{source,id,tripId,version:Number(version)});
 }
 return unique.size<=20?[...unique.values()]:null;
}
import {apiGetCached,apiDelete,invalidateApiCache,type ApiResponse} from "./api.service";
import {removeCachedReportRecord,invalidateReportPageCache} from "./report.service";
export async function readRecordDeletionCapabilities(token:string){const result=await apiGetCached<ApiResponse<{storeCalls:boolean;emptyStops:boolean}>>("/store-calls/deletion-capabilities",token,30000);if(!result.success||!result.data)throw Error("Unable to read deletion capabilities");return result.data;}
export async function deleteSelectedPhysicalRecords(token:string,targets:PhysicalDeletionTarget[]){
 if(!targets.length||targets.length>20||new Set(targets.map(x=>x.source+":"+x.id)).size!==targets.length)throw Error("Invalid deletion selection");
 const deleted:PhysicalDeletionTarget[]=[],failed:PhysicalDeletionTarget[]=[];
 for(const target of targets){try{if(!["store_calls","trip_stops"].includes(target.source)||!uuid(target.id)||!uuid(target.tripId)||!Number.isSafeInteger(target.version)||target.version<0)throw Error();
  const endpoint=target.source==="store_calls"?`/store-calls/${target.id}`:`/trips/${target.tripId}/stops/${target.id}/record-only`;
  const response=await apiDelete<ApiResponse<{id:string;trip_id:string}>>(endpoint,token,{expected_version:target.version});if(!response.success||response.data?.id!==target.id||response.data.trip_id!==target.tripId)throw Error();
  deleted.push(target);removeCachedReportRecord(target.source,target.id);
 }catch{failed.push(target);}}
 if(deleted.length){invalidateApiCache("/reports");invalidateReportPageCache();}return {deleted,failed};
}
