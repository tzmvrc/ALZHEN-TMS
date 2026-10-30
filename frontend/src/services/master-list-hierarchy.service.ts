import {apiGet,apiPost,invalidateApiCache,type ApiResponse} from "./api.service";
import {invalidateReportPageCache} from "./report.service";

export type MasterCell={value:string;detail?:string;count?:number};
export type MasterValues=Record<string,MasterCell>;
export type MasterLine={id:string;trip_id:string;stop_id:string;read_only?:boolean;values:MasterValues};
export type MasterDr={id:string;trip_id:string;stop_id:string;stop_sequence:number|null;dr_number:string;read_only?:boolean;dr_count:number;line_count:number;delivered_count:number;quantity:string;cbm:string;values:MasterValues;lines:MasterLine[]};
export type MasterTruckAssignment={id:string;trip_id:string;plate_number:string;trucking_company:string;dr_count:number;line_count:number;delivered_count:number;quantity:string;cbm:string;values:MasterValues;drs:MasterDr[]};
export type MasterTrip={id:string;trip_id:string;trip_number:string;convoy:boolean;dr_count:number;line_count:number;delivered_count:number;quantity:string;cbm:string;values:MasterValues;drs:MasterDr[];flat_drs?:MasterDr[];assignments:MasterTruckAssignment[];unallocated_drs:MasterDr[]};
export type MasterDispatch={dispatch_number:string;trip_ids:string[];loading_date:string|null;dr_count:number;line_count:number;delivered_count:number;quantity:string;cbm:string;values:MasterValues};
export type MasterPage={rows:MasterDispatch[];page:number;total:number;limit:number;editingAvailable:boolean};
export type MasterChange={scope:"dispatch"|"dr"|"line";id:string;field:string;value:string|number;dispatch?:string;trip?:string;dr_key?:string;unallocated_key?:string;baseline_quantity?:number;baseline_cbm?:number};

function unwrap<T>(response:ApiResponse<T>,fallback:string):T {if(!response.success||response.data==null)throw new Error(response.message??fallback);return response.data;}
export async function fetchMasterDispatches(token:string,options:{page:number;search:string;group:string;date_from?:string;date_to?:string;trucker?:string;warehouse?:string;delivery_status?:string}){
  const params=new URLSearchParams();Object.entries(options).forEach(([key,value])=>{if(value!==undefined&&value!=="")params.set(key,String(value));});
  return unwrap(await apiGet<ApiResponse<MasterPage>>(`/trips/master-list/dispatches?${params}`,token),"Unable to load dispatches.");
}
export async function fetchMasterChildren(token:string,dispatch:string,group:string){
  return unwrap(await apiGet<ApiResponse<MasterTrip[]>>(`/trips/master-list/dispatches/${encodeURIComponent(dispatch)}/children?group=${encodeURIComponent(group)}`,token),"Unable to load trips.");
}
export async function fetchMasterChildrenBatch(token:string,dispatches:string[],group:string){
  return unwrap(await apiPost<ApiResponse<Record<string,MasterTrip[]>>>("/trips/master-list/dispatches/children",{dispatches,group},token),"Unable to load trips.");
}
export async function fetchMasterDeleteDispatchTrips(token:string,dispatches:string[]){
  return unwrap(await apiPost<ApiResponse<Record<string,string[]>>>("/trips/master-list/dispatches/delete-targets",{dispatches},token),"Unable to resolve selected dispatches.");
}
export async function saveMasterChanges(token:string,changes:MasterChange[]){
  const result=unwrap(await apiPost<ApiResponse<{saved:number;notification_warning?:string|null}>>("/trips/master-list/batch",{changes},token),"Unable to save changes.");
  invalidateApiCache("/trips");invalidateApiCache("/reports");invalidateReportPageCache();return result;
}
export async function deleteMasterListStop(token:string,tripId:string,stopId:string){
  const result=unwrap(await apiPost<ApiResponse<{trip_id:string;trip_stop_id:string|null;operation_id:string}>>(
    `/trips/master-list/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/delete`,{},token),
    "Unable to delete the selected DR."
  );
  if(result.trip_id!==tripId||result.trip_stop_id!==stopId||!result.operation_id)throw new Error("DR deletion was not confirmed. Reload before retrying.");
  invalidateApiCache("/trips");invalidateApiCache("/reports");invalidateReportPageCache();
  return result;
}
