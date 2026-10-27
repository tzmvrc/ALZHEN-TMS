import {collectSelectionPages} from "./spreadsheet-selection";
import { invalidateOperationalFormulaReads } from "./operational-formula.service";
import { getReportRowIdentity } from "./report-row-identity";
import { ApiError, apiGet, apiGetCached, invalidateApiCache, type ApiResponse } from "./api.service";
import type { DropdownField } from "./dropdown-option.service";

export const REPORTS = {
  combined: { title: "Combined Report", endpoint: "/reports/combined" },
  "dispatch-monitoring": {
    title: "Dispatch Monitoring",
    endpoint: "/reports/dispatch-monitoring",
  },
  dispatch: { title: "Dispatch Report", endpoint: "/reports/dispatch" },
  "trip-booking": { title: "Trip Booking", endpoint: "/reports/trip-booking" },
  "store-calling": {
    title: "Store Calling",
    endpoint: "/reports/store-calling",
  },
} as const;

export type ReportKey = keyof typeof REPORTS;
export type ReportColumn = {
  sourceHeader?: {
    group: string;
    label: string;
    sourceColor: string;
    background: string;
    color: string;
  };
  fieldCategory?: "EXCEL" | "ADMIN" | "DRIVER";
  key: string;
  title: string;
  type: string;
};
export type ReportRow = Record<string, unknown>;
export type ReportFilter = {
  key: string;
  label: string;
  type?: "date" | "text";
  dropdownField?: DropdownField;
};
export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ReportData<T> = {
  rows: T[];
  pagination: Pagination;
};

export type ReportPageOptions = {
  page: number;
  limit: number;
  search: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filters: Record<string, string>;
  cardMeta?: boolean;
};

export type ReportPageBundle = {
  /** Loaded network window; operational pagination totals remain authoritative. */
  collection?: { page:number; totalPages:number };
  columns: ReportColumn[];
  rows: ReportRow[];
  pagination: Pagination;
};

export const REPORT_PAGE_CACHE_TTL_MS = 90_000;
export const REPORT_PAGE_STALE_TTL_MS = 5 * 60_000;
const reportPageCache = new Map<string, { reportKey: ReportKey; token: string; expiresAt: number; staleUntil: number; value: ReportPageBundle }>();
const reportPageRequests = new Map<string, Promise<ReportPageBundle>>();
const reportPageErrors = new Map<string, string>();
const reportReadFailures = new Map<string, { cause: unknown; retryAfter: number }>();
const REPORT_FAILURE_COOLDOWN_MS = 10_000;
const reportPageVersions = new Map<ReportKey, number>();
// Column definitions do not change when a record is edited. Keep their cache
// separate from row/API invalidation, scoped to the session and sheet projection.
const reportColumnCache = new Map<string, { expiresAt: number; columns: ReportColumn[] }>();
const reportColumnRequests = new Map<string, Promise<ReportColumn[]>>();
let reportPageCacheGeneration = 0;
let reportPageSessionGeneration = 0;

export function getInitialReportPageOptions(reportKey: ReportKey): ReportPageOptions {
  return { page: 1, limit: 50, search: "", sortBy: getSortableFields(reportKey)[0], sortOrder: "desc", filters: {} };
}

/** Query-specific diagnostics use the same identity as navigation and preloading. */
export function getReportPageState(reportKey: ReportKey, token: string, options: ReportPageOptions) {
  const key = reportPageCacheKey(reportKey, token, options);
  const cached = reportPageCache.get(key);
  return {
    fetching: reportPageRequests.has(key),
    error: reportPageErrors.get(key) ?? null,
    lastSuccessfulFetchAt: cached ? cached.expiresAt - REPORT_PAGE_CACHE_TTL_MS : null,
    fresh: Boolean(cached && cached.expiresAt > Date.now()),
  };
}

function reportPageCacheKey(reportKey: ReportKey, token: string, options: ReportPageOptions) {
  return JSON.stringify([
    token,
    reportKey,
    options.page,
    options.limit,
    options.search.trim(),
    options.sortBy,
    options.sortOrder,
    Boolean(options.cardMeta),
    Object.fromEntries(Object.entries(options.filters).sort(([left], [right]) => left.localeCompare(right))),
  ]);
}

export function getCachedReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
): ReportPageBundle | null {
  const key = reportPageCacheKey(reportKey, token, options);
  const entry = reportPageCache.get(key);
  if (!entry) return null;
  return entry.expiresAt > Date.now() ? entry.value : null;
}

export function getStaleReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
): ReportPageBundle | null {
  const key = reportPageCacheKey(reportKey, token, options);
  const entry = reportPageCache.get(key);
  if (!entry) return null;
  if (entry.staleUntil <= Date.now()) {
    reportPageCache.delete(key);
    return null;
  }
  return entry.value;
}

export function clearReportPageCache() {
  reportColumnCache.clear();
  reportColumnRequests.clear();
  deletedReportRecords.clear();
  invalidateOperationalFormulaReads();
  reportPageSessionGeneration += 1;
  reportPageCacheGeneration += 1;
  reportCollections.clear();
  collectionOwners.clear();
  reportCollectionRequests.clear();
  tripReportRequests.clear();
  reportPageCache.clear();
  reportPageRequests.clear();
  reportPageErrors.clear();
  reportReadFailures.clear();
  reportPageVersions.clear();
}

export function invalidateReportPageCache(reportKey?: ReportKey) {
  if (reportKey) reportPageVersions.set(reportKey, (reportPageVersions.get(reportKey) ?? 0) + 1);
  else reportPageCacheGeneration += 1;
  for (const [key, entry] of reportCollections) {
    if (!reportKey || entry.reportKey === reportKey) reportCollections.set(key,{...entry,expiresAt:0});
  }
  for (const [key, entry] of reportPageCache) {
    if (!reportKey || entry.reportKey === reportKey) reportPageCache.delete(key);
  }
  for (const key of reportPageRequests.keys()) {
    if (!reportKey || key.includes(`"${reportKey}"`)) reportPageRequests.delete(key);
  }
  for (const key of reportPageErrors.keys()) {
    if (!reportKey || key.includes(`"${reportKey}"`)) reportPageErrors.delete(key);
  }
}

export function setCachedReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
  value: ReportPageBundle,
) {
  for(const key of reportPageCache.keys()){if(reportPageCache.size<150)break;if(!reportPageRequests.has(key))reportPageCache.delete(key);}
  reportPageCache.set(reportPageCacheKey(reportKey, token, options), {
    reportKey,
    token,
    expiresAt: Date.now() + REPORT_PAGE_CACHE_TTL_MS,
    staleUntil: Date.now() + REPORT_PAGE_STALE_TTL_MS,
    value,
  });
}

export function updateCachedReportPages(
  reportKey: ReportKey,
  token: string,
  update: (bundle: ReportPageBundle) => ReportPageBundle,
) {
  for (const [key, entry] of reportCollections) {
    if (entry.reportKey === reportKey && entry.token === token) reportCollections.set(key, {...entry,value:update(entry.value)});
  }
  for (const [key, entry] of reportPageCache) {
    if (entry.reportKey === reportKey && entry.token === token) {
      reportPageCache.set(key, { ...entry, value: update(entry.value) });
    }
  }
}

export function invalidateReportData(reportKey: ReportKey) {
  invalidateApiCache(REPORTS[reportKey].endpoint);
  invalidateReportPageCache(reportKey);
}

/** A deliberate Retry bypasses failure backoff; realtime invalidation does not. */
export function retryReportRead(reportKey: ReportKey, token: string) {
  for (const key of reportReadFailures.keys()) {
    const [owner, report] = JSON.parse(key);
    if (owner === token && report === reportKey) reportReadFailures.delete(key);
  }
  invalidateReportData(reportKey);
}

function checkReportReadBackoff(report: ReportKey, token: string, options: ReportPageOptions) {
  const failure = reportReadFailures.get(reportPageCacheKey(report, token, options));
  if (failure && failure.retryAfter > Date.now()) throw failure.cause;
}

const sortFields: Record<ReportKey, string[]> = {
  combined: [
    "loading_date",
    "dispatch_number",
    "trip_number",
    "trip_status",
    "delivery_status",
    "customer_name",
    "warehouse_code",
    "plate_number",
    "quantity",
    "cbm",
  ],
  "dispatch-monitoring": [
    "loading_date",
    "dispatch_number",
    "trip_status",
    "delivery_status",
    "customer_name",
    "warehouse_code",
  ],
  dispatch: [
    "loading_date",
    "dispatch_number",
    "customer_name",
    "delivery_status",
    "wh_code",
    "plate_number",
  ],
  "trip-booking": [
    "loading_date",
    "dispatch_number",
    "trip_type",
    "warehouse_code",
    "customer_name",
    "trip_status",
    "delivery_status",
  ],
  "store-calling": [
    "date_assigned",
    "dispatch_number",
    "customer_name",
    "status",
    "confirmation_status",
    "assigned_to",
  ],
};

const reportFilters: Record<ReportKey, ReportFilter[]> = {
  combined: [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "trip_status", label: "Trip status", dropdownField: "trip_status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "customer_name", label: "Customer" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  "dispatch-monitoring": [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "trip_status", label: "Trip status", dropdownField: "trip_status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "customer_name", label: "Customer" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  dispatch: [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "wh_code", label: "Warehouse code" },
    { key: "customer_name", label: "Customer" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  "trip-booking": [
    { key: "date_from", label: "Loading date from", type: "date" },
    { key: "date_to", label: "Loading date to", type: "date" },
    { key: "dispatch_number", label: "Dispatch number" },
    { key: "trip_status", label: "Trip status", dropdownField: "trip_status" },
    { key: "delivery_status", label: "Delivery status", dropdownField: "delivery_status" },
    { key: "warehouse_code", label: "Warehouse code" },
    { key: "plate_number", label: "Plate number" },
    { key: "letter_status", label: "Letter status", dropdownField: "letter_status" },
    { key: "driver_name", label: "Driver" },
  ],
  "store-calling": [
    { key: "status", label: "Status", dropdownField: "store_call_status" },
    { key: "confirmation_status", label: "Confirmation status", dropdownField: "confirmation_status" },
    { key: "assigned_to", label: "Assigned to" },
    { key: "date_from", label: "Assigned date from", type: "date" },
    { key: "date_to", label: "Assigned date to", type: "date" },
  ],
};

for (const report of ["combined", "dispatch", "trip-booking", "dispatch-monitoring"] as const) {
  reportFilters[report].push(...[
    ["sp_reference", "SP"], ["ph_truck_reference", "PH TRUCK NAME"], ["dn_reference", "DN"],
    ["order_item_number", "Order Item No."], ["so_number", "SO NO."], ["stock_quantity", "stocks"],
    ["unit_cbm", "CBM"], ["so_approval_date", "SO Approval Date"], ["item_status", "Item Status"],
    ["source_warehouse", "Warehouse"], ["source_product_category", "Product Category"],
    ["source_province", "Province"], ["source_city", "City"],
  ].map(([key, label]) => ({ key, label })));
}

function unwrap<T>(response: ApiResponse<T>, message: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.message ?? message);
  }
  return response.data;
}

export async function fetchReportColumns(
  reportKey: ReportKey,
  token: string,
  fresh = false,
  sourceLines = false,
): Promise<ReportColumn[]> {
  const endpoint = `/reports/${reportKey}/columns${sourceLines ? "?source_lines=true" : ""}`;
  const key = JSON.stringify([token, endpoint]);
  const cached = reportColumnCache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.columns;
  const pending = reportColumnRequests.get(key);
  if (pending) return pending;
  const session = reportPageSessionGeneration;
  const request = (async () => {
    const response = fresh
      ? await apiGet<ApiResponse<{ report: string; columns: ReportColumn[] }>>(endpoint, token)
      : await apiGetCached<ApiResponse<{ report: string; columns: ReportColumn[] }>>(endpoint, token, REPORT_PAGE_CACHE_TTL_MS);
    if (session !== reportPageSessionGeneration) throw new Error("The session changed while loading report columns.");
    const columns = unwrap(response, "Unable to load report columns.").columns;
    reportColumnCache.set(key, { columns, expiresAt: Date.now() + REPORT_PAGE_CACHE_TTL_MS });
    return columns;
  })();
  reportColumnRequests.set(key, request);
  try { return await request; }
  finally { if (reportColumnRequests.get(key) === request) reportColumnRequests.delete(key); }
}

export async function fetchReportRows(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions & { fresh?: boolean; selectionOnly?:boolean },
): Promise<ReportData<ReportRow>> {
  const params = new URLSearchParams({
    page: String(options.page),
    limit: String(options.limit),
    sort_by: options.sortBy,
    sort_order: options.sortOrder,
  });
  if(options.selectionOnly)params.set("selection_only","true");
  if(options.cardMeta && !options.selectionOnly)params.set("card_meta","true");
  if (options.search.trim()) params.set("search", options.search.trim());
  if (!params.get("sort_by")) params.delete("sort_by");
  if(options.filters.trip_id) params.set("trip_id",options.filters.trip_id);
  if(options.filters.trip_ids) params.set("trip_ids",options.filters.trip_ids);
  if(options.filters.record_delete_versions==="true")params.set("record_delete_versions","true");
  if(options.filters.source_lines==="true")params.set("source_lines","true");
  for (const key of ["sp_reference", "ph_truck_reference", "dn_reference", "order_item_number", "so_number", "stock_quantity", "unit_cbm", "so_approval_date", "item_status", "source_warehouse", "source_product_category", "source_province", "source_city"]) {
    if (options.filters[key]?.trim()) params.set(key, options.filters[key].trim());
  }
  if(options.filters.issue_filter && options.filters.issue_filter!=="All") params.set("issue_filter",options.filters.issue_filter);
  for (const filter of reportFilters[reportKey]) {
    const value = options.filters[filter.key]?.trim();
    if (value) params.set(filter.key, value);
  }
  if (reportKey === "dispatch-monitoring" && options.filters.ongoing_only === "true") {
    params.set("ongoing_only", "true");
  }
  if (reportKey === "dispatch-monitoring" && options.filters.active_transactions === "true") {
    params.set("active_transactions", "true");
    params.set("archive_scope", options.filters.archive_scope === "archived" ? "archived" : "active");
  }

  const endpoint = `${REPORTS[reportKey].endpoint}?${params.toString()}`;
  const response = options.fresh
    ? await apiGet<ApiResponse<ReportData<ReportRow>>>(endpoint, token)
    : await apiGetCached<ApiResponse<ReportData<ReportRow>>>(endpoint, token, REPORT_PAGE_CACHE_TTL_MS);
  return unwrap(response, "Unable to load report rows.");
}

/** Shared by login preloading and ReportDataView so both warm and consume the same page cache. */
export async function fetchReportPage(
  reportKey: ReportKey,
  token: string,
  options: ReportPageOptions,
  refresh = false,
  rebaseAttempt = 0,
): Promise<ReportPageBundle> {
  const key = reportPageCacheKey(reportKey, token, options);
  const cached = getCachedReportPage(reportKey, token, options);
  if (cached && !refresh) return cached;
  const pending = reportPageRequests.get(key);
  if (pending) return pending;
  const failure = reportReadFailures.get(key);
  if (!refresh && failure && failure.retryAfter > Date.now()) throw failure.cause;

  const requestGeneration = reportPageCacheGeneration;
  const reportVersion = reportPageVersions.get(reportKey) ?? 0;
  const sessionGeneration = reportPageSessionGeneration;
  reportPageErrors.delete(key);
  const request = Promise.all([
    fetchReportColumns(reportKey, token, false, options.filters.source_lines === "true"),
    fetchReportRows(reportKey, token, { ...options, fresh: refresh }),
  ]).then(([columns, result]) => {
    if (sessionGeneration !== reportPageSessionGeneration) throw new Error("The session changed while loading reports.");
    if (requestGeneration !== reportPageCacheGeneration || reportVersion !== (reportPageVersions.get(reportKey) ?? 0)) {
      const newer=getCachedReportPage(reportKey,token,options);if(newer)return newer;
      if(rebaseAttempt>=1)throw new Error("Report data changed while loading. Your current rows are preserved; retry loading.");
      if (reportPageRequests.get(key) === request) reportPageRequests.delete(key);
      return fetchReportPage(reportKey,token,options,true,rebaseAttempt+1);
    }
    const bundle = { columns, rows: result.rows, pagination: result.pagination };
    reportReadFailures.delete(key);
    if (requestGeneration === reportPageCacheGeneration) {
      const now = Date.now();
      reportPageCache.set(key, {
        reportKey,
        token,
        expiresAt: now + REPORT_PAGE_CACHE_TTL_MS,
        staleUntil: now + REPORT_PAGE_STALE_TTL_MS,
        value: bundle,
      });
    }
    return bundle;
  }).catch((cause: unknown) => {
    if (sessionGeneration === reportPageSessionGeneration && reportPageRequests.get(key) === request) {
      reportPageErrors.set(key, cause instanceof Error ? cause.message : "Unable to load report.");
      if ((cause instanceof ApiError && (cause.status >= 500 || cause.status === 408 || cause.status === 429)) || cause instanceof TypeError) {
        reportReadFailures.set(key, { cause, retryAfter: Date.now() + REPORT_FAILURE_COOLDOWN_MS });
      }
    }
    throw cause;
  }).finally(() => {
    if (reportPageRequests.get(key) === request) reportPageRequests.delete(key);
  });
  reportPageRequests.set(key, request);
  return request;
}

export function getSortableFields(reportKey: ReportKey): string[] {
  return sortFields[reportKey];
}

export function getReportFilters(reportKey: ReportKey): ReportFilter[] {
  return reportFilters[reportKey];
}

// A collection uses the same authorized endpoint, with bounded network pages and no total cap.
type CollectionEntry={reportKey:ReportKey;token:string;expiresAt:number;value:ReportPageBundle};
const reportCollections=new Map<string,CollectionEntry>();
const collectionOwners=new Map<string,Set<symbol>>();
type CollectionRequest={latest?:ReportPageBundle;promise:Promise<ReportPageBundle>;listeners:Set<(value:ReportPageBundle)=>void>;consumers:Set<symbol>;cancelled:boolean};
const reportCollectionRequests=new Map<string,CollectionRequest>();
async function consumeCollection(key:string,entry:CollectionRequest,onProgress?: (value:ReportPageBundle)=>void,signal?:AbortSignal){
 const consumer=Symbol();entry.consumers.add(consumer);if(onProgress){entry.listeners.add(onProgress);if(entry.latest)onProgress(entry.latest);}
 const leave=()=>{entry.consumers.delete(consumer);if(onProgress)entry.listeners.delete(onProgress);queueMicrotask(()=>{if(!entry.consumers.size){entry.cancelled=true;if(reportCollectionRequests.get(key)===entry)reportCollectionRequests.delete(key);}});};
 if(signal?.aborted){leave();throw new DOMException("Report request cancelled.","AbortError");}
 signal?.addEventListener("abort",leave,{once:true});
 try{return await entry.promise;}finally{signal?.removeEventListener("abort",leave);leave();}
}
const collectionKey=(report:ReportKey,token:string,options:ReportPageOptions)=>reportPageCacheKey(report,token,{...options,page:1,limit:options.limit});
/** Mounted (including retained hidden) sheets own their loaded window. */
export function retainReportCollection(report:ReportKey,token:string,options:ReportPageOptions){
 const key=collectionKey(report,token,options),owner=Symbol(),owners=collectionOwners.get(key)??new Set<symbol>();owners.add(owner);collectionOwners.set(key,owners);
 return()=>{owners.delete(owner);if(!owners.size&&collectionOwners.get(key)===owners)collectionOwners.delete(key);};
}
export function getReportCollection(report:ReportKey,token:string,options:ReportPageOptions,stale=false){
 const entry=reportCollections.get(collectionKey(report,token,options));return entry&&(stale||entry.expiresAt>Date.now())?entry.value:null;
}
export async function fetchReportCollection(report:ReportKey,token:string,options:ReportPageOptions,onProgress?:(value:ReportPageBundle)=>void,refresh=false,signal?:AbortSignal):Promise<ReportPageBundle>{
 for(const [oldKey,entry] of reportCollections)if(entry.expiresAt+300_000<Date.now()&&!reportCollectionRequests.has(oldKey)&&!collectionOwners.has(oldKey))reportCollections.delete(oldKey);
 for(const oldKey of reportCollections.keys()){if(reportCollections.size<=20)break;if(!reportCollectionRequests.has(oldKey)&&!collectionOwners.has(oldKey))reportCollections.delete(oldKey);}
 const key=collectionKey(report,token,options),cached=getReportCollection(report,token,options);
 if(cached&&!refresh)return cached;
 const existing=reportCollectionRequests.get(key);
 if(existing&&!existing.cancelled)return consumeCollection(key,existing,onProgress,signal);
 const listeners=new Set<(value:ReportPageBundle)=>void>();
 const entry:CollectionRequest={promise:null as unknown as Promise<ReportPageBundle>,listeners,consumers:new Set(),cancelled:false};
 const session=reportPageSessionGeneration,generation=reportPageCacheGeneration,version=reportPageVersions.get(report)??0;
 const promise=(async()=>{
  // First paint needs one page, not every historical record. On recovery,
  // revalidate only the pages this user has already requested.
  const previous=getReportCollection(report,token,options,true);
  const readOptions=options;
  const loadedPages=refresh?(previous?.collection?.page??1):1;
  const firstOptions={...readOptions,page:1,limit:options.limit};
  checkReportReadBackoff(report,token,firstOptions);
  const first=await fetchReportPage(report,token,firstOptions,refresh);
  const columns=first.columns,physical=new Map<string,ReportRow>();let page=1;let result:ReportPageBundle;
  do{
   if(entry.cancelled)throw new DOMException("Report request cancelled.","AbortError");
   if(session!==reportPageSessionGeneration)throw Error("The session changed while loading reports.");
   const next=page===1?first:await fetchReportPage(report,token,{...readOptions,page,limit:options.limit},refresh);
   for(const row of next.rows){const id=getReportRowIdentity(report,row);if(id)physical.set(id,row);else physical.set(`unmapped:${page}:${physical.size}`,row);}
   const rows=[...physical.values()].filter(row=>!isDeletedReportRecord(row));
   result={columns,rows,pagination:{...next.pagination,page:1,limit:rows.length,total:next.pagination.total,totalPages:1},collection:{page,totalPages:next.pagination.totalPages}};
   entry.latest=result;for(const listener of listeners)listener(result);
   if(page>=Math.min(loadedPages,next.pagination.totalPages)||!next.rows.length)break;
   page++;
  }while(true);
  if(entry.cancelled)throw new DOMException("Report request cancelled.","AbortError");
  if(session!==reportPageSessionGeneration)throw Error("The session changed while loading reports.");
  // Complete a sweep even under continuous writes; never recursively restart all pages.
  // The view coalesces dirty signals and applies confirmed row reconciliations.
  const current=generation===reportPageCacheGeneration&&version===(reportPageVersions.get(report)??0);
  reportCollections.set(key,{reportKey:report,token,expiresAt:current?Date.now()+REPORT_PAGE_CACHE_TTL_MS:0,value:result!});return result!;
 })();
 entry.promise=promise;reportCollectionRequests.set(key,entry);
 try{return await consumeCollection(key,entry,onProgress,signal);}finally{if(reportCollectionRequests.get(key)===entry)reportCollectionRequests.delete(key);listeners.clear();}
}

/** Append one network page on scroll/explicit request. Shared callers dedupe
 * through the existing collection request registry; there is no history sweep. */
export async function fetchNextReportCollection(report:ReportKey,token:string,options:ReportPageOptions,signal?:AbortSignal):Promise<ReportPageBundle>{
 const key=collectionKey(report,token,options),pending=reportCollectionRequests.get(key);
 if(pending&&!pending.cancelled)return consumeCollection(key,pending,undefined,signal);
 const base=getReportCollection(report,token,options,true);
 if(!base?.collection)return fetchReportCollection(report,token,options,undefined,false,signal);
 if(base.collection.page>=base.collection.totalPages)return base;
 const session=reportPageSessionGeneration,version=reportPageVersions.get(report)??0;
 const entry:CollectionRequest={promise:null as unknown as Promise<ReportPageBundle>,listeners:new Set(),consumers:new Set(),cancelled:false};
 entry.promise=(async()=>{
  const nextPage=base.collection!.page+1;
  const next=await fetchReportPage(report,token,{...options,page:nextPage,limit:options.limit});
  if(entry.cancelled||session!==reportPageSessionGeneration)throw new DOMException("Report request cancelled.","AbortError");
  if(version!==(reportPageVersions.get(report)??0))throw Error("Report data changed while loading more rows. Retry after reconciliation.");
  const latest=getReportCollection(report,token,options,true)??base;
  const physical=new Map(latest.rows.map((row,index)=>[getReportRowIdentity(report,row)??`unmapped:existing:${index}`,row]));
  for(const [index,row] of next.rows.entries()){
   const id=getReportRowIdentity(report,row)??`unmapped:${nextPage}:${index}`;
   // Overlapping pages must not replace a newer confirmed edit in an existing row.
   if(!physical.has(id))physical.set(id,row);
  }
  const rows=[...physical.values()].filter(row=>!isDeletedReportRecord(row));
  const result:ReportPageBundle={...latest,rows,pagination:{...next.pagination,page:1,limit:rows.length,totalPages:1},collection:{page:next.rows.length?nextPage:next.pagination.totalPages,totalPages:next.pagination.totalPages}};
  reportCollections.set(key,{reportKey:report,token,expiresAt:Date.now()+REPORT_PAGE_CACHE_TTL_MS,value:result});return result;
 })();reportCollectionRequests.set(key,entry);
 try{return await consumeCollection(key,entry,undefined,signal);}finally{if(reportCollectionRequests.get(key)===entry)reportCollectionRequests.delete(key);}
}

const tripReportRequests=new Map<string,Promise<ReportRow[]>>();
/** Refresh just one parent and all its physical stop/line/assignment rows. */
export async function fetchReportTripRows(report:ReportKey,token:string,options:ReportPageOptions,tripId:string){
 const key=JSON.stringify([token,report,options,tripId]);const pending=tripReportRequests.get(key);if(pending)return pending;
 const session=reportPageSessionGeneration;
 const readOptions={...options,page:1,limit:200,filters:{...options.filters,trip_id:tripId}};
 checkReportReadBackoff(report,token,readOptions);
 const promise=(async()=>{let page=1;const rows:ReportRow[]=[];
  do{const result=await fetchReportPage(report,token,{...readOptions,page},true);
   if(session!==reportPageSessionGeneration)throw Error("The session changed.");rows.push(...result.rows);
   if(page>=result.pagination.totalPages||!result.rows.length)return rows.filter(row=>!isDeletedReportRecord(row));page++;
  }while(true);
 })();tripReportRequests.set(key,promise);
 try{return await promise;}finally{if(tripReportRequests.get(key)===promise)tripReportRequests.delete(key);}
}
export function updateReportCollection(report:ReportKey,token:string,options:ReportPageOptions,update:(rows:ReportRow[])=>ReportRow[]){
 const key=collectionKey(report,token,options),entry=reportCollections.get(key);if(!entry)return;
 const rows=update(entry.value.rows);reportCollections.set(key,{...entry,expiresAt:Date.now()+REPORT_PAGE_CACHE_TTL_MS,value:{...entry.value,rows,pagination:{...entry.value.pagination,limit:rows.length}}});
}

// Session-scoped tombstones prevent stale retained sheets/in-flight reads reviving deleted rows.
const deletedReportRecords=new Set<string>();
const reportEntityFields:Record<string,string>={trips:"trip_id",trip_stops:"trip_stop_id",trip_line_items:"trip_line_item_id",trip_truck_assignments:"assignment_id",store_calls:"store_call_id"};
export function isDeletedReportRecord(row:ReportRow){return Object.entries(reportEntityFields).some(([source,field])=>{const id=row[field]??row[`_${field}`];return typeof id==="string"&&deletedReportRecords.has(`${source}:${id}`);});}
export function removeCachedReportRecord(source:string,id:string){
 if(!reportEntityFields[source])return;deletedReportRecords.add(`${source}:${id}`);
 const remove=(value:ReportPageBundle)=>{const rows=value.rows.filter(row=>!isDeletedReportRecord(row));return {...value,rows,pagination:{...value.pagination,total:Math.max(0,value.pagination.total-(value.rows.length-rows.length))}};};
 for(const [key,entry] of reportPageCache)reportPageCache.set(key,{...entry,value:remove(entry.value)});
 for(const [key,entry] of reportCollections)reportCollections.set(key,{...entry,value:remove(entry.value)});
}

export const fetchReportSelection=(report:ReportKey,token:string,options:ReportPageOptions,current:()=>boolean)=>collectSelectionPages(
 page=>fetchReportRows(report,token,{...options,page,limit:100,fresh:true,selectionOnly:true}),row=>getReportRowIdentity(report,row),current);
