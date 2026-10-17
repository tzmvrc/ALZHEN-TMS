import {apiGetCached,apiGet,apiPost,type ApiResponse} from "./api.service";
import type {TrackedAssignment} from "../components/admin/TrackedTruckLayer";
export async function trackingAvailable(token:string){const r=await apiGetCached<ApiResponse<{enabled:boolean}>>("/tracking/capabilities",token);return r.data?.enabled===true;}
export async function ownTrackingAssignments(token:string){const r=await apiGet<ApiResponse<Array<{id:string;trip_id:string;plate_number:string|null}>>>("/tracking/assignments",token);if(!r.success||!r.data)throw Error(r.message||"Assignments unavailable");return r.data;}
export async function activeTracking(token:string,after:string|null=null){
 const path=`/tracking/active${after?`?after=${encodeURIComponent(after)}`:""}`;
 const r=await apiGetCached<ApiResponse<{rows:TrackedAssignment[];next:string|null}>>(path,token,1000);
 if(!r.success||!r.data)throw Error(r.message||"Tracking unavailable");return r.data;
}
export async function trackingMutation<T>(token:string,id:string,action:string,payload:unknown,signal?:AbortSignal){const r=await apiPost<ApiResponse<T>>(`/tracking/assignments/${encodeURIComponent(id)}/${action}`,payload,token,signal);if(!r.success||!r.data)throw Error(r.message||"Location sharing failed");return r.data;}
