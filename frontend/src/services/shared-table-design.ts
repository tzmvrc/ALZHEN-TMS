import {apiGet,apiPatch,type ApiResponse} from "./api.service";
export type CellDesign={bold?:boolean;italic?:boolean;underline?:boolean;color?:string|null;backgroundColor?:string|null;fontSize?:number|null;fontFamily?:string|null};
export type HeaderDesign=Pick<CellDesign,"color"|"backgroundColor"|"fontSize">;
export type ColumnDesign={header?:HeaderDesign;hidden?:boolean;position?:number;pin?:"left"|"right"|null;color?:string|null;alignment?:"left"|"center"|"right"|null;format?:CellDesign;cells?:Record<string,CellDesign|null>};
type Row={column_key:string;revision:number;width_px:number;design:ColumnDesign};
export type DesignSnapshot={columns:Record<string,ColumnDesign>;loaded:boolean;saving:boolean;error:string};
type Layout={order:string[];hidden:string[];colors?:Record<string,string>;pins?:Record<string,"left"|"right">};
export function designLayout<T extends Layout>(local:T,keys:readonly string[],columns:Record<string,ColumnDesign>,loaded:boolean):T{
 if(!loaded)return local;
 return {...local,order:[...keys].sort((a,b)=>(columns[a]?.position??1001)-(columns[b]?.position??1001)),hidden:keys.filter(k=>columns[k]?.hidden),colors:Object.fromEntries(keys.flatMap(k=>columns[k]?.color?[[k,columns[k].color]]:[])),pins:Object.fromEntries(keys.flatMap(k=>columns[k]?.pin?[[k,columns[k].pin]]:[]))} as T;
}
export function designChanges(before:Layout,after:Layout){const patches:Record<string,ColumnDesign>={},reordered=before.order.join("\u0000")!==after.order.join("\u0000");for(const [position,key] of after.order.entries()){const patch:ColumnDesign={};if(reordered)patch.position=position;if(before.hidden.includes(key)!==after.hidden.includes(key))patch.hidden=after.hidden.includes(key);if((before.colors?.[key]??null)!==(after.colors?.[key]??null))patch.color=after.colors?.[key]??null;if((before.pins?.[key]??null)!==(after.pins?.[key]??null))patch.pin=after.pins?.[key]??null;if(Object.keys(patch).length)patches[key]=patch;}return patches;}
export const emptyDesign:DesignSnapshot={columns:{},loaded:false,saving:false,error:""};
type Entry={active:boolean;epoch:number;rows:Map<string,Row>;drafts:Map<string,{patch:ColumnDesign;width:number}>;listeners:Set<()=>void>;snapshot:DesignSnapshot;request?:Promise<void>;write?:Promise<void>};
const entries=new Map<string,Entry>();
const endpoint=(table:string)=>`/table-layouts/${encodeURIComponent(table)}/design`;
function entry(token:string,table:string){const key=`${token}:${table}`;if(!entries.has(key))entries.set(key,{active:true,epoch:0,rows:new Map(),drafts:new Map(),listeners:new Set(),snapshot:emptyDesign});return entries.get(key)!;}
function merge(base:ColumnDesign,patch:ColumnDesign):ColumnDesign{return {...base,...patch,...(patch.header?{header:{...base.header,...patch.header}}:{}),...(patch.format?{format:{...base.format,...patch.format}}:{}),...(patch.cells?{cells:{...base.cells,...patch.cells}}:{})};}
export const mergeColumnDesign = merge;
function publish(e:Entry,error=e.snapshot.error){if(!e.active)return;const columns=Object.fromEntries([...e.rows].map(([k,v])=>[k,v.design??{}]));for(const [k,v] of e.drafts)columns[k]=merge(columns[k]??{},v.patch);const next={...e.snapshot,columns,saving:Boolean(e.write),error};if(JSON.stringify(next)===JSON.stringify(e.snapshot))return;e.snapshot=next;e.listeners.forEach(fn=>fn());}
export const readSharedDesign=(token:string,table:string)=>entry(token,table).snapshot;
export function subscribeSharedDesign(token:string,table:string,fn:()=>void){const e=entry(token,table);e.listeners.add(fn);return()=>{e.listeners.delete(fn);};}
export function clearSharedDesign(){for(const e of entries.values()){e.active=false;e.epoch++;e.listeners.clear();}entries.clear();}
export async function refreshSharedDesign(token:string,table:string){
 const e=entry(token,table);if(e.request)return e.request;const epoch=e.epoch;
 e.request=apiGet<ApiResponse<Row[]>>(endpoint(table),token).then(response=>{
  if(!response.success||!Array.isArray(response.data))throw Error("Shared design response was invalid.");
  if(!e.active||epoch!==e.epoch)return;
  for(const row of response.data){if(row.revision>=(e.rows.get(row.column_key)?.revision??0))e.rows.set(row.column_key,row);}
  e.snapshot={...e.snapshot,loaded:true};publish(e,e.drafts.size?e.snapshot.error:"");
 }).catch(error=>{if(epoch===e.epoch)publish(e,error instanceof Error?error.message:"Shared design could not be loaded.");}).finally(()=>{e.request=undefined;});return e.request;
}
export function saveSharedDesign(token:string,table:string,column:string,patch:ColumnDesign,width:number){const e=entry(token,table);const current=e.drafts.get(column);e.drafts.set(column,{patch:merge(current?.patch??{},patch),width});e.epoch++;publish(e,"");return retrySharedDesign(token,table);}
/** Queue the complete physical-key order before starting the existing revisioned writer. */
export function saveSharedColumnOrder(token: string, table: string, keys: readonly string[], width: (key: string) => number) {
 const e = entry(token, table);
 if (keys.length > 1001 || new Set(keys).size !== keys.length) { publish(e, "Invalid column order. No layout was saved."); return Promise.resolve(); }
 let changed = false;
 keys.forEach((column, position) => {
  const pending = e.drafts.get(column);
  if ((pending?.patch.position ?? e.rows.get(column)?.design?.position) === position) return;
  e.drafts.set(column, { patch: merge(pending?.patch ?? {}, { position }), width: width(column) });
  changed = true;
 });
 if (!changed) return Promise.resolve();
 e.epoch++; publish(e, "");
 return retrySharedDesign(token, table);
}
export function retrySharedDesign(token:string,table:string){
 const e=entry(token,table);if(e.write)return e.write;
 e.write=Promise.resolve().then(async()=>{
  await e.request;await refreshSharedDesign(token,table);if(!e.active)return;if(!e.snapshot.loaded)throw Error(e.snapshot.error||"Shared design is unavailable.");
  while(e.active&&e.drafts.size){const [column,draft]=e.drafts.entries().next().value!;e.epoch++;
   const response=await apiPatch<ApiResponse<Row>>(`${endpoint(table)}/${encodeURIComponent(column)}`,{patch:draft.patch,initial_width_px:Math.max(60,Math.min(1600,Math.round(draft.width))),expected_revision:e.rows.get(column)?.revision??0},token);
   if(!e.active)return;if(!response.success||!response.data||response.data.column_key!==column)throw Error("Server did not confirm the shared design.");
   e.epoch++;e.rows.set(column,response.data);if(e.drafts.get(column)===draft)e.drafts.delete(column);publish(e,"");
  }
 }).catch(error=>publish(e,`${error instanceof Error?error.message:"Save failed."} Design changes remain unsaved; retry.`)).finally(()=>{e.write=undefined;publish(e);});publish(e);return e.write;
}
