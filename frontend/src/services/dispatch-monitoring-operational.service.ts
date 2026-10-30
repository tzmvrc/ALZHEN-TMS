import {fetchReportRows,type ReportPageOptions,type ReportRow} from "./report.service";
import {monitoringField} from "./dispatch-monitoring-model";
/** Hydrate the bounded parent window in batches, not one request per truck/stop.
 * Removing presentation filters here is essential: progress needs every scoped stop. */
export async function loadMonitoringWindow(token:string,options:ReportPageOptions,known:ReadonlySet<string>,signal:AbortSignal,fresh=false){
 if(signal.aborted)throw new DOMException("Cancelled","AbortError");
 const seed=await fetchReportRows("dispatch-monitoring",token,{...options,fresh});
 const trips=[...new Set(seed.rows.map(row=>monitoringField(row,"trip_id","_trip_id")).filter(Boolean))].filter(id=>!known.has(id));
 const rows:ReportRow[]=[];
 for(let start=0;start<trips.length;start+=25){
  const ids=trips.slice(start,start+25);
  for(let page=1;page<=100;page++){
   if(signal.aborted)throw new DOMException("Cancelled","AbortError");
   const result=await fetchReportRows("dispatch-monitoring",token,{page,limit:200,search:"",sortBy:"loading_date",sortOrder:"desc",filters:{trip_ids:ids.join(","),active_transactions:options.filters.active_transactions??"true",archive_scope:options.filters.archive_scope??"active"},fresh});
   rows.push(...result.rows);
   if(page>=result.pagination.totalPages||!result.rows.length)break;
   if(page===100)throw Error("This monitoring window is too large. Narrow the date range to load complete assignment details.");
  }
 }
 return {rows,trips,more:options.page<seed.pagination.totalPages,sourceCount:seed.rows.length};
}
