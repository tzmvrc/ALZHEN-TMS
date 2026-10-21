import { apiPatch, ApiError, type ApiResponse } from "./api.service";
import {clearSharedDesign,readSharedLayoutRows} from "./shared-table-design";

export type SharedWidth = { table_key: string; column_key: string; width_px: number; revision: number; updated_at: string; updated_by: string | null };
export type WidthSnapshot = { widths: Record<string, number>; error: string; saving: boolean; loaded: boolean };
type Entry = { fetchedAt?:number; active: boolean; value: WidthSnapshot; loaded: boolean; rows: Map<string, SharedWidth>; drafts: Map<string, number>; listeners: Set<() => void>; epoch: number; request?: Promise<void>; write?: Promise<void> };
const entries = new Map<string, Entry>();
const endpoint = (table: string) => `/table-layouts/${encodeURIComponent(table)}`;
export const emptyWidths: WidthSnapshot = { widths: {}, error: "", saving: false, loaded: false };
function entry(token: string, table: string) {
  const key = `${token}:${table}`;
  if (!entries.has(key)) entries.set(key, { active: true, value: emptyWidths, loaded: false, rows: new Map(), drafts: new Map(), listeners: new Set(), epoch: 0 });
  return entries.get(key)!;
}
function publish(state: Entry, error = state.value.error) {
  if (!state.active) return;
  const widths = Object.fromEntries([...state.rows].map(([key, row]) => [key, row.width_px]));
  for (const [key, width] of state.drafts) widths[key] = width;
  const before = state.value;
  if (before.loaded === state.loaded && before.error === error && before.saving === Boolean(state.write) && Object.keys(before.widths).length === Object.keys(widths).length && Object.entries(widths).every(([key, width]) => before.widths[key] === width)) return;
  state.value = { widths, error, saving: Boolean(state.write), loaded: state.loaded };
  state.listeners.forEach((listener) => listener());
}
export const readSharedWidths = (token: string, table: string) => entry(token, table).value;
export function clearSharedWidths() {
  clearSharedDesign();
  for (const state of entries.values()) { state.active = false; state.epoch++; state.drafts.clear(); state.listeners.clear(); }
  entries.clear();
}
export function subscribeSharedWidths(token: string, table: string, listener: () => void) {
  const state = entry(token, table); state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}
export function refreshSharedWidths(token: string, table: string, force=false): Promise<void> {
  const state = entry(token, table);
  if (state.request) return state.request;
  if(!force&&state.loaded&&Date.now()-(state.fetchedAt??0)<10000)return Promise.resolve();
  const epoch = state.epoch;
  state.request = readSharedLayoutRows(token,table,force).then((rows) => {
    if (!state.active) return;
    for(const row of rows)if(row.revision >= (state.rows.get(row.column_key)?.revision??0))state.rows.set(row.column_key,{...row,table_key:table,updated_at:row.updated_at??"",updated_by:row.updated_by??null});
    state.fetchedAt=Date.now();state.loaded = true;
    publish(state, state.drafts.size ? state.value.error : "");
  }).catch((error) => { if (state.epoch === epoch) publish(state, error instanceof Error ? error.message : "Shared layout refresh failed."); }).finally(() => { state.request = undefined; });
  return state.request;
}
export function saveSharedWidth(token: string, table: string, column: string, width: number): Promise<void> {
  const state = entry(token, table);
  const rounded = Math.max(60, Math.min(1600, Math.round(width)));
  if (!state.drafts.has(column) && state.rows.get(column)?.width_px === rounded) return Promise.resolve();
  state.drafts.set(column, rounded); state.epoch += 1; publish(state, "");
  return retrySharedWidths(token, table);
}
export function retrySharedWidths(token: string, table: string): Promise<void> {
  const state = entry(token, table);
  if (state.write) return state.write;
  // Refresh before retrying a conflict; the user's unsaved width stays visible.
  state.write = Promise.resolve().then(async () => {
    await state.request;
    if (!state.active) return;
    await refreshSharedWidths(token, table, true);
    while (state.active && state.drafts.size) {
      const [column, width] = state.drafts.entries().next().value!;
      if(state.rows.get(column)?.width_px===width){if(state.drafts.get(column)===width)state.drafts.delete(column);publish(state,"");continue;}
      let response:ApiResponse<SharedWidth>|undefined;
      for(let attempt=0;attempt<3;attempt++){
        const revision=state.rows.get(column)?.revision??0;state.epoch++;
        try{
          response=await apiPatch<ApiResponse<SharedWidth>>(`${endpoint(table)}/${encodeURIComponent(column)}`,{width_px:width,expected_revision:revision},token);
          if(!response.success||!response.data||response.data.column_key!==column||response.data.width_px!==width||response.data.revision<=revision)throw Error("The column width was not saved.");
          break;
        }catch(error){if(!(error instanceof ApiError)||error.status!==409||attempt===2)throw error;await refreshSharedWidths(token,table,true);}
      }
      if(!response?.data)throw Error("The column width was not saved.");
      if (!state.active) return;
      if (!response.success || !response.data) throw new Error("The column width was not saved.");
      state.epoch += 1;
      state.rows.set(column, response.data);
      if (state.drafts.get(column) === width) state.drafts.delete(column);
      // A newer release on the same column is processed by the next pass.
      publish(state, "");
    }
  }).catch((error) => { publish(state, `${error instanceof Error ? error.message : "Width save failed."} Width is unsaved; retry to save it for everyone.`); }).finally(() => {
    state.write = undefined; publish(state);
  });
  publish(state);
  return state.write;
}
