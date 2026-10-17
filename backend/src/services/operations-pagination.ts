import { ApiError } from "../utils/api-response.js";
import { buildIlikeOrFilter } from "../utils/postgrest-search.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export const OPERATIONS_SORT_FIELDS = ["date","trip","plate_number","driver_name","route","dr_number","quantity","total_cbm","report_type","remarks","reported_by"] as const;
export type OperationsPageQuery = {page:number;limit:number;search:string;filter:string;sortBy:string;sortOrder:"asc"|"desc"};
export function parseOperationsPageQuery(input:Record<string,unknown>):OperationsPageQuery {
  const integer=(key:string,fallback:number,max:number)=>{
    const value=input[key]; if(value===undefined)return fallback;
    if(typeof value!=="string"||!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw new ApiError("Invalid page or page size.",400,"INVALID_PAGE");
    return Number(value);
  };
  const text=(key:string,fallback="")=>{const value=input[key];if(value===undefined)return fallback;if(typeof value!=="string"||value.length>100)throw new ApiError("Invalid page query.",400,"INVALID_PAGE_QUERY");return value.trim();};
  const search=text("search"),filter=text("filter","All"),sortBy=text("sort_by","date"),sortOrder=text("sort_order","desc");
  if(!["All","Loading","Unloading","Backload","Offload"].includes(filter)||!(OPERATIONS_SORT_FIELDS as readonly string[]).includes(sortBy)||!["asc","desc"].includes(sortOrder))throw new ApiError("Unsupported Operations filter or sort.",400,"INVALID_PAGE_QUERY");
  buildIlikeOrFilter(["search_text"],search);
  return {page:integer("page",1,1000000),limit:integer("limit",50,100),search,filter,sortBy,sortOrder:sortOrder as "asc"|"desc"};
}
export function operationsPageRequest(client:Pick<SupabaseClient,"from">,options:OperationsPageQuery){
  let query=client.from("v_operations_report_page").select("source_type,source_record_id,trip_id,trip_stop_id,dr_number,quantity,total_cbm,route,date,reported_by",{count:"exact"});
  const search=buildIlikeOrFilter(["search_text"],options.search);if(search)query=query.or(search);
  if(options.filter!=="All")query=query.eq("report_type",options.filter);
  const sortColumn=["date","quantity","total_cbm"].includes(options.sortBy)?options.sortBy:`${options.sortBy}_sort`;
  query=query.order(sortColumn,{ascending:options.sortOrder==="asc",nullsFirst:false}).order("source_type",{ascending:true}).order("source_record_id",{ascending:true});
  const offset=(options.page-1)*options.limit;
  return query.range(offset,offset+options.limit-1);
}
