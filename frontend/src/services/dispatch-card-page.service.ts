import { fetchTrips } from "./trip.service";
import {apiGetCached,type ApiResponse} from "./api.service";
import { fetchReportColumns, type ReportPageBundle, type ReportPageOptions, type ReportRow } from "./report.service";

/** Card View pages by trips first, so a dispatch with many source lines cannot
 * hide every later dispatch behind expensive offsets in the wide report view. */
export async function fetchDispatchCardPage(token:string,options:ReportPageOptions,page:number):Promise<ReportPageBundle>{
  const [trips,columns]=await Promise.all([
    fetchTrips(token,{page,limit:3,sortBy:"loading_date",sortOrder:options.sortOrder}),
    fetchReportColumns("dispatch-monitoring",token,false,true),
  ]);
  const representativeTrips=new Map<string,string>();
  for(const trip of trips.rows){
    const id=typeof trip.id==="string"?trip.id:"";
    const dispatch=typeof trip.dispatch_number==="string"?trip.dispatch_number.trim():"";
    if(id&&!representativeTrips.has(dispatch||id))representativeTrips.set(dispatch||id,id);
  }
  const ids=[...representativeTrips.values()];
  const response=ids.length?await apiGetCached<ApiResponse<ReportRow[]>>(`/reports/dispatch-cards?trip_ids=${ids.join(",")}`,token,15_000):null;
  if(response&&!response.success)throw new Error(response.message??"Unable to load dispatch cards.");
  const details=new Map((response?.data??[]).map(row=>[String(row.trip_id),row]));
  const byId=new Map(trips.rows.map(trip=>[trip.id,trip]));
  const rows=ids.map(id=>{
    const source=details.get(id);
    if(source)return source;
    const trip=byId.get(id);
    return { ...(trip??{}),_card_summary:true,trip_id:id,trip_status:trip?.status??null } as ReportRow;
  });
  return {columns,rows,pagination:trips.pagination,collection:{page,totalPages:trips.pagination.totalPages}};
}
