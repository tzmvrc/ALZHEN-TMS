import type { CellFormula } from "./spreadsheet-formula";
import { apiDelete, apiGet,apiGetCached,getCachedApiResponse,invalidateApiCache, apiPatch, apiPost, type ApiResponse } from "./api.service";

export type FlexValueType = "TEXT" | "NUMBER" | "DATE" | "DATETIME" | "BOOLEAN";
export type FlexInputMode = "TEXT" | "DROPDOWN" | "NUMBER" | "DATE" | "DATETIME" | "BOOLEAN";
export type FlexColumn = { id: string; table_id: string; name: string; position: number; value_type: FlexValueType; input_mode: FlexInputMode; binding_scope: string; settings: Record<string, unknown>; is_hidden: boolean; is_archived: boolean; version: number };
export type FlexCell = { id: string; row_id: string; column_id: string; value: unknown; formula?: CellFormula | null; version: number; updated_by: string | null };
export type FlexOption = { id: string; column_id: string; label: string; stored_value: string; position: number; color: string | null; is_active: boolean };
export type FlexRow = { id: string; table_id: string; row_kind: "CUSTOM" | "SOURCE"; position: number; version: number; cells: FlexCell[] };
export type FlexTable = { id: string; name: string; table_kind: "CUSTOM" | "REPORT"; report_key: string | null; settings: Record<string, unknown>; created_by: string; version: number; created_at: string; updated_at: string; archived_at: string | null; access?: { can_view: boolean; can_edit: boolean; can_manage: boolean; is_owner: boolean } };
export type FlexPermission = { id: string; table_id: string; subject_type: "ROLE" | "PROFILE"; subject_role: string | null; subject_profile_id: string | null; can_view: boolean; can_edit: boolean; can_manage: boolean };
export type FlexTableData = { table: FlexTable; access: { canView: boolean; canEdit: boolean; canManage: boolean; isOwner: boolean; isAdmin: boolean }; columns: FlexColumn[]; rows: FlexRow[]; formula_sources?:FlexRow[]; pagination?:{page:number;limit:number;total:number;totalPages:number}; options: FlexOption[] };
export type FlexProfile = { id: string; full_name: string; role: string };
export type FlexSectionKey = "combined_report" | "dispatch_monitoring" | "dispatch_report" | "trip_booking" | "store_calling" | "fleet";

async function getData<T>(promise: Promise<ApiResponse<T>>) {
  const response = await promise;
  if (!response.success || response.data === undefined) throw new Error(response.message ?? "Flexible table request failed.");
  return response.data;
}

async function getMutationData<T>(promise:Promise<ApiResponse<T>>){try{return await getData(promise);}finally{invalidateApiCache("/flexible-tables");}}
const path = (tableId: string) => `/flexible-tables/${encodeURIComponent(tableId)}`;
export const listFlexibleTables = (token: string) => getData(apiGet<ApiResponse<FlexTable[]>>("/flexible-tables", token));
const sectionPath = (sectionKey: FlexSectionKey) => `/flexible-tables/sections/${encodeURIComponent(sectionKey)}/tables`;
export const getCachedSectionFlexibleTables=(token:string,sectionKey:FlexSectionKey)=>getCachedApiResponse<ApiResponse<FlexTable[]>>(sectionPath(sectionKey),token,300000)?.data??null;
export const invalidateSectionFlexibleTables=(sectionKey:FlexSectionKey)=>invalidateApiCache(sectionPath(sectionKey));
export const listSectionFlexibleTables = (token: string, sectionKey: FlexSectionKey) => getData(apiGetCached<ApiResponse<FlexTable[]>>(sectionPath(sectionKey), token,30000));
export const connectFlexibleTableToSection = async (token: string, sectionKey: FlexSectionKey, tableId: string) => {
  const result = await getMutationData(apiPost<ApiResponse<FlexTable>>(sectionPath(sectionKey), { table_id: tableId }, token));
  invalidateSectionFlexibleTables(sectionKey); return result;
};
export const disconnectFlexibleTableFromSection = async (token: string, sectionKey: FlexSectionKey, tableId: string) => {
  const result = await getMutationData(apiDelete<ApiResponse<FlexTable>>(`${sectionPath(sectionKey)}/${encodeURIComponent(tableId)}`, token));
  invalidateSectionFlexibleTables(sectionKey); return result;
};
export const createFlexibleTable = (token: string, name: string) => getMutationData(apiPost<ApiResponse<FlexTable>>("/flexible-tables", { name }, token));
export const getFlexibleTable = (token: string, id: string,options:{page?:number;limit?:number;search?:string}={}) => getData(apiGetCached<ApiResponse<FlexTableData>>(`${path(id)}?${new URLSearchParams({page:String(options.page??1),limit:String(options.limit??50),search:options.search??""})}`, token,30_000));
export const renameFlexibleTable = (token: string, id: string, name: string, expected_version: number) => getMutationData(apiPatch<ApiResponse<FlexTable>>(path(id), { name, expected_version }, token));
export const archiveFlexibleTable = (token: string, id: string, expected_version: number) => getMutationData(apiPatch<ApiResponse<FlexTable>>(`${path(id)}/archive`, { expected_version }, token));
export const createFlexColumn = (token: string, id: string, input: Partial<FlexColumn> & { name: string }) => getMutationData(apiPost<ApiResponse<FlexColumn>>(`${path(id)}/columns`, input, token));
export const updateFlexColumn = (token: string, id: string, columnId: string, input: Partial<FlexColumn> & { expected_version: number }) => getMutationData(apiPatch<ApiResponse<FlexColumn>>(`${path(id)}/columns/${columnId}`, input, token));
export const archiveFlexColumn = (token: string, id: string, columnId: string, expected_version: number) => getMutationData(apiDelete<ApiResponse<FlexColumn>>(`${path(id)}/columns/${columnId}`, token, { expected_version }));
export const createFlexRow = (token: string, id: string) => getMutationData(apiPost<ApiResponse<FlexRow>>(`${path(id)}/rows`, {}, token));
export const reorderFlexRow = (token: string, id: string, rowId: string, position: number, expected_version: number) => getMutationData(apiPatch<ApiResponse<FlexRow>>(`${path(id)}/rows/${rowId}`, { position, expected_version }, token));
export const archiveFlexRow = (token: string, id: string, rowId: string, expected_version: number) => getMutationData(apiDelete<ApiResponse<FlexRow>>(`${path(id)}/rows/${rowId}`, token, { expected_version }));
export const saveFlexCell = (token: string, id: string, rowId: string, columnId: string, value: unknown, expected_version: number, formula: CellFormula | null = null) => getMutationData(apiPatch<ApiResponse<FlexCell>>(`${path(id)}/rows/${rowId}/cells/${columnId}`, { value, formula, expected_version }, token));
export const getFlexPermissions = (token: string, id: string) => getData(apiGet<ApiResponse<FlexPermission[]>>(`${path(id)}/permissions`, token));
export const createFlexPermission = (token: string, id: string, input: Partial<FlexPermission>) => getMutationData(apiPost<ApiResponse<FlexPermission>>(`${path(id)}/permissions`, input, token));
export const updateFlexPermission = (token: string, id: string, permissionId: string, input: Pick<FlexPermission, "can_view" | "can_edit" | "can_manage">) => getMutationData(apiPatch<ApiResponse<FlexPermission>>(`${path(id)}/permissions/${permissionId}`, input, token));
export const deleteFlexPermission = (token: string, id: string, permissionId: string) => getMutationData(apiDelete<ApiResponse<{ id: string }>>(`${path(id)}/permissions/${permissionId}`, token));
export const createFlexOption = (token: string, id: string, columnId: string, input: Pick<FlexOption, "label" | "stored_value"> & Partial<Pick<FlexOption, "color" | "position">>) => getMutationData(apiPost<ApiResponse<FlexOption>>(`${path(id)}/columns/${columnId}/options`, input, token));
export const getFlexOptions = (token: string, id: string, columnId: string) => getData(apiGet<ApiResponse<FlexOption[]>>(`${path(id)}/columns/${columnId}/options`, token));
export const updateFlexOption = (token: string, id: string, columnId: string, optionId: string, input: Partial<Pick<FlexOption, "label" | "stored_value" | "position" | "color" | "is_active">>) => getMutationData(apiPatch<ApiResponse<FlexOption>>(`${path(id)}/columns/${columnId}/options/${optionId}`, input, token));
export const listFlexProfiles = (token: string) => getData(apiGet<ApiResponse<FlexProfile[]>>(`/lookups/assignees`, token));

export const saveFlexFormulaBatch=(token:string,id:string,changes:Array<{row_id:string;column_id:string;formula:CellFormula;expected_version:number}>)=>getMutationData(apiPost<ApiResponse<{saved:FlexCell[];failure:{index:number;message:string}|null;atomic:false}>>(`${path(id)}/formulas/batch`,{changes},token));
