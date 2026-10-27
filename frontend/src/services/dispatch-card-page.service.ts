import { fetchTrips } from "./trip.service";
import { fetchReportColumns, fetchReportRows, type ReportPageBundle, type ReportPageOptions, type ReportRow } from "./report.service";

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
  const details=await Promise.all([...representativeTrips.values()].map(id=>fetchReportRows("dispatch-monitoring",token,{
    ...options,page:1,limit:10,cardMeta:true,
    filters:{...options.filters,trip_ids:id,card_preview:"true"},
  })));
  const byId=new Map(trips.rows.map(trip=>[trip.id,trip]));
  const rows=[...representativeTrips.values()].map((id,index)=>{
    const source=details[index].rows[0];
    if(source)return source;
    const trip=byId.get(id);
    return { ...(trip??{}),trip_id:id,trip_status:trip?.status??null } as ReportRow;
  });
  return {columns,rows,pagination:trips.pagination,collection:{page,totalPages:trips.pagination.totalPages}};
}
