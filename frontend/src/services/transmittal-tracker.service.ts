import { apiGet, apiGetCached, apiPatch, apiPost, getCachedApiResponse, invalidateApiCache, type ApiResponse } from "./api.service";
import { invalidateReportPageCache } from "./report.service";

export type TransmittalTrackerCell = { value: unknown; version: number; row_id: string };
export type TransmittalTrackerRow = {
  assignment_id?: string | null;
  assigned_plate_number?: string | null;
  trip_stop_id: string;
  trip_id: string;
  transmittal_ref: string;
  warehouse_code: string;
  delivered_to: string;
  plate_number: string;
  driver_name: string;
  delivery_receipt_no: string;
  sales_order_no: string;
  date_created: string;
  status: string;
  lbc_waybill_no: string;
  shipping_date_via_lbc: string;
  remarks: string;
  loading_date: string;
  date_delivered: string;
  cells: Record<string, TransmittalTrackerCell>;
  legacy_conflicts: string[];
};
/** Projection key is local UI identity; every write still uses trip_stop_id. */
export const trackerRowKey=(row:Pick<TransmittalTrackerRow,"trip_stop_id"|"assignment_id">)=>`${row.trip_stop_id}${row.assignment_id?`~${row.assignment_id}`:""}`;
export type TransmittalTrackerResponse = {
  table_id: string;
  pagination?: {page:number;limit:number;total:number;totalPages:number};
  access: { canView: boolean; canEdit: boolean; canManage: boolean; isOwner: boolean; isAdmin: boolean };
  columns: Array<{ id: string; name: string; settings: Record<string, unknown>; value_type: string; input_mode: string; binding_scope: string }>;
  rows: TransmittalTrackerRow[];
};

export const TRANSMITTAL_TRACKER_ENDPOINT = "/reports/transmittal-tracker";
export const TRANSMITTAL_TRACKER_CACHE_TTL_MS = 30_000;
export const invalidateTransmittalTrackerCache = () => {
  invalidateApiCache(TRANSMITTAL_TRACKER_ENDPOINT);
  invalidateApiCache("/reports/combined");
  invalidateApiCache("/reports/dispatch-monitoring");
  invalidateApiCache("/reports/operations");
  invalidateReportPageCache("combined");
  invalidateReportPageCache("dispatch-monitoring");
};

async function unwrap<T>(request: Promise<ApiResponse<T>>) {
  const response = await request;
  if (!response.success || response.data === undefined) throw new Error(response.message ?? "Transmittal Tracker request failed.");
  return response.data;
}

export const TRACKER_PAGINATION_ENABLED = import.meta.env ? import.meta.env.VITE_TRACKER_PAGINATION !== "false" : false;
export type TrackerPageOptions = {page?:number;limit?:number;search?:string;sortBy?:string;sortOrder?:"asc"|"desc";filterBy?:string;filter?:string;status?:string;reference?:string};
export function trackerPageEndpoint(options: TrackerPageOptions = {}) {
  const query=new URLSearchParams({page:String(options.page??1),limit:String(options.limit??50),search:options.search??"",sort_by:options.sortBy??"trip_stop_id",sort_order:options.sortOrder??"asc"});
  if(options.filterBy&&options.filter){query.set("filter_by",options.filterBy);query.set("filter",options.filter);}
  if(options.status)query.set("status",options.status);
  if(options.reference!==undefined)query.set("reference",options.reference);
  return `${TRANSMITTAL_TRACKER_ENDPOINT}/page?${query}`;
}
export const fetchTrackerPage=(token:string,options:TrackerPageOptions={})=>unwrap(apiGetCached<ApiResponse<TransmittalTrackerResponse>>(trackerPageEndpoint(options),token,TRANSMITTAL_TRACKER_CACHE_TTL_MS));
export const fetchTransmittalTracker = (token: string, search = "", options:TrackerPageOptions={}) => TRACKER_PAGINATION_ENABLED
  ? fetchTrackerPage(token,{...options,search})
  : unwrap(apiGetCached<ApiResponse<TransmittalTrackerResponse>>(`${TRANSMITTAL_TRACKER_ENDPOINT}?search=${encodeURIComponent(search)}`, token, TRANSMITTAL_TRACKER_CACHE_TTL_MS));
export const getCachedTransmittalTracker = (token: string,options:TrackerPageOptions={}) => getCachedApiResponse<ApiResponse<TransmittalTrackerResponse>>(TRACKER_PAGINATION_ENABLED?trackerPageEndpoint(options):`${TRANSMITTAL_TRACKER_ENDPOINT}?search=`, token, 5 * 60_000)?.data ?? null;
export const preloadTransmittalTracker = (token: string) => TRACKER_PAGINATION_ENABLED ? fetchTrackerPage(token) : unwrap(apiGetCached<ApiResponse<TransmittalTrackerResponse>>(`${TRANSMITTAL_TRACKER_ENDPOINT}?search=`, token, TRANSMITTAL_TRACKER_CACHE_TTL_MS, `${TRANSMITTAL_TRACKER_ENDPOINT}?search=&preload=true`));

/** Explicit export only: bounded fresh requests; never called by normal navigation. */
export async function fetchTrackerExportRows(token:string,options:TrackerPageOptions={}) {
  if(!TRACKER_PAGINATION_ENABLED) return (await fetchTransmittalTracker(token)).rows;
  return fetchPagedTrackerExportRows(token,options);
}
export async function fetchPagedTrackerExportRows(token:string,options:TrackerPageOptions={}) {
  const rows:TransmittalTrackerRow[]=[],seen=new Set<string>(); let expectedTotal:number|undefined;
  for(let page=1;;page++) {
    const result=await unwrap(apiGet<ApiResponse<TransmittalTrackerResponse>>(trackerPageEndpoint({...options,page,limit:100,sortBy:"trip_stop_id",sortOrder:"asc"}),token));
    if(!result.pagination)throw new Error("The export page is missing pagination metadata.");
    if(expectedTotal!==undefined&&expectedTotal!==result.pagination.total)throw new Error("Tracker records changed during export. Retry to export current data.");
    expectedTotal=result.pagination.total;
    if(expectedTotal>20000)throw new Error("Export exceeds 20,000 rows. Filter by a Transmittal Reference or narrow the export.");
    for(const row of result.rows){const identity=trackerRowKey(row);if(seen.has(identity))throw new Error("Tracker rows changed during export. Retry.");seen.add(identity);rows.push(row);}
    if(page>=result.pagination.totalPages)break;
    if(!result.rows.length)throw new Error("Tracker records changed during export. Retry.");
  }
  return rows;
}

export const initializeTransmittalTracker = async (token: string) => {
  const result = await unwrap(apiPost<ApiResponse<{ id: string; initialized: boolean }>>("/reports/transmittal-tracker/initialize", {}, token));
  invalidateTransmittalTrackerCache();
  return result;
};

export const saveTransmittalTrackerCell = async (token: string, stopId: string, field: string, value: unknown, expected_version: number, resolve_legacy_conflict = false) => {
  const result = await unwrap(apiPatch<ApiResponse<{ field: string; trip_stop_id: string; row_id: string; cell: TransmittalTrackerCell; audit_warning?: string }>>(
    `/reports/transmittal-tracker/stops/${encodeURIComponent(stopId)}/cells/${encodeURIComponent(field)}`,
    { value, expected_version, ...(resolve_legacy_conflict ? { resolve_legacy_conflict: true } : {}) },
    token,
  ));
  invalidateTransmittalTrackerCache();
  return result;
};

/** Clear only saved tracker overlays. DR remains an authoritative stop field. */
export async function resetTrackerOverrides(token:string,rows:TransmittalTrackerRow[]){
 const fields=new Set(["warehouse_code_override","delivered_to_override","plate_number_override","sales_order_no_override","transmittal_ref","date_created_override","tracker_status","lbc_waybill_no","lbc_shipping_date","tracker_remarks","loading_date_override","delivery_date_override"]);
 const unique=[...new Map(rows.map(row=>[row.trip_stop_id,row])).values()];if(!unique.length||unique.length>20)throw Error("Select at most 20 delivery stops.");
 const completed:string[]=[],failed:TransmittalTrackerRow[]=[];let auditWarnings=0;
 for(const row of unique){let success=true;
  for(const [field,cell] of Object.entries(row.cells)){if(!fields.has(field)||cell.value===null)continue;if(row.legacy_conflicts.includes(field)){success=false;continue;}
   try{const saved=await saveTransmittalTrackerCell(token,row.trip_stop_id,field,null,cell.version);cell.version=saved.cell.version;cell.value=null;if(saved.audit_warning)auditWarnings++;}catch{success=false;}
  }
  if(success)completed.push(row.trip_stop_id);else failed.push(row);
 }
 return {completed,failed,auditWarnings};
}
