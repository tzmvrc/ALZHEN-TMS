import {apiGet,type ApiResponse} from './api.service';
export type StopProgress={completed:number;total:number;percent:number|null};
export type ActiveHomeTrip={id:string;reference:string|null;trip_number:number|null;origin:string|null;destinations:{id:string;name:string|null;sequence:number}[];progress:StopProgress};
export type ActiveTripsPage={rows:ActiveHomeTrip[];active_total:number;warning?:string;pagination:{page:number;limit:number;total:number;totalPages:number}};
export async function fetchActiveHomeTrips(token:string,page:number,search:string){const params=new URLSearchParams({page:String(page),limit:'25',search});const response=await apiGet<ApiResponse<ActiveTripsPage>>(`/trips/active-overview?${params}`,token,30000);if(!response.success||!response.data)throw Error(response.message||'Active trips could not load. Retry when connected.');return response.data;}
