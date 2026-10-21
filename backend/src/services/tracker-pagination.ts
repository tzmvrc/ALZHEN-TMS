import { ApiError } from "../utils/api-response.js";
import { buildIlikeOrFilter } from "../utils/postgrest-search.js";
export const TRACKER_PAGE_FIELDS = ["warehouse_code","delivered_to","plate_number","delivery_receipt_no","sales_order_no","transmittal_ref","date_created","status","lbc_waybill_no","shipping_date_via_lbc","remarks","loading_date","date_delivered","driver_name"] as const;
export type TrackerPageQuery = { page: number; limit: number; search: string; sortBy: string; sortOrder: "asc" | "desc"; filterBy: string; filter: string; reference?: string };
export function parseTrackerPageQuery(input: Record<string, unknown>): TrackerPageQuery {
  const integer = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new ApiError("Invalid page or page size.", 400, "INVALID_PAGE");
    return Number(value);
  };
  const text = (key: string, fallback = "") => { const value = input[key]; if (value === undefined) return fallback; if (typeof value !== "string" || value.length > 100) throw new ApiError(`Invalid ${key}.`,400,"INVALID_PAGE_QUERY"); return value.trim(); };
  const sortBy = text("sort_by","trip_stop_id"), sortOrder = text("sort_order","asc"), filterBy = text("filter_by"), filter = text("filter"), search = text("search");
  if (!["trip_stop_id",...TRACKER_PAGE_FIELDS].includes(sortBy) || !["asc","desc"].includes(sortOrder) || (filterBy && !(TRACKER_PAGE_FIELDS as readonly string[]).includes(filterBy)) || (filter && !filterBy)) throw new ApiError("Unsupported Tracker sort or filter.",400,"INVALID_PAGE_QUERY");
  buildIlikeOrFilter(TRACKER_PAGE_FIELDS,search); buildIlikeOrFilter(filterBy?[filterBy]:[],filter);
  return {page:integer(input.page,1,1000000),limit:integer(input.limit,50,100),search,sortBy,sortOrder:sortOrder as "asc"|"desc",filterBy,filter,reference: input.reference === undefined ? undefined : text("reference")};
}
/** Page in PostgreSQL, then enrich only these stable stop identities. */
export function trackerPageRequest(client: { from: (table: string) => any }, options: TrackerPageQuery) {
  let query=client.from("v_transmittal_tracker_page").select("*",{count:"exact"});
  const search=buildIlikeOrFilter(TRACKER_PAGE_FIELDS,options.search);
  const filter=buildIlikeOrFilter(options.filterBy?[options.filterBy]:[],options.filter);
  const predicates=[search,filter].filter((value):value is string=>Boolean(value));
  if(predicates.length) query=query.or(predicates.length===1 ? predicates[0] : `and(${predicates.map(value=>`or(${value})`).join(",")})`);
  if(options.reference!==undefined)query=query.eq("transmittal_ref",options.reference);
  query=query.order(options.sortBy,{ascending:options.sortOrder==="asc",nullsFirst:false});
  if(options.sortBy!=="trip_stop_id")query=query.order("trip_stop_id",{ascending:true});
  query=query.order("assignment_id",{ascending:true,nullsFirst:false});
  const offset=(options.page-1)*options.limit;
  return query.range(offset,offset+options.limit-1);
}
