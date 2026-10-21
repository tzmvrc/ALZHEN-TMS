import { apiPost,type ApiResponse } from "./api.service";
import type { CellFormula } from "./spreadsheet-formula";
export type FormulaOverlay={id:string;table_key:string;row_identity:string;column_key:string;formula_expression:string|null;reference_bindings:CellFormula["references"];version:number;is_deleted:boolean};
export type FormulaChange={row_identity:string;column_key:string;expression:string|null;references:CellFormula["references"];expected_version:number};
export type FormulaSnapshot={formulas:FormulaOverlay[];sources:Array<{id:string;values:Record<string,unknown>}>};
function isOverlay(value:unknown):value is FormulaOverlay {
 if(!value||typeof value!=="object")return false;
 const row=value as Partial<FormulaOverlay>;
 return typeof row.id==="string"&&typeof row.table_key==="string"&&typeof row.row_identity==="string"&&typeof row.column_key==="string"&&Number.isInteger(row.version)&&Number(row.version)>0&&typeof row.is_deleted==="boolean"&&(row.is_deleted?row.formula_expression===null:typeof row.formula_expression==="string"&&row.formula_expression.startsWith("="))&&Boolean(row.reference_bindings)&&typeof row.reference_bindings==="object"&&!Array.isArray(row.reference_bindings)&&Object.values(row.reference_bindings).every(ref=>ref&&typeof ref==="object"&&typeof ref.rowId==="string"&&typeof ref.columnId==="string");
}
function isSnapshot(value:unknown):value is FormulaSnapshot {
 if(!value||typeof value!=="object")return false;
 const data=value as Partial<FormulaSnapshot>;
 return Array.isArray(data.formulas)&&data.formulas.every(isOverlay)&&Array.isArray(data.sources)&&data.sources.every(row=>row&&typeof row.id==="string"&&row.values&&typeof row.values==="object"&&!Array.isArray(row.values));
}
type FormulaRead={table:string;expiresAt:number;promise:Promise<FormulaSnapshot>};
const formulaReads=new Map<string,FormulaRead>();
let activeReads=0;const readQueue:Array<()=>void>=[];
function scheduleRead<T>(read:()=>Promise<T>):Promise<T>{return new Promise((resolve,reject)=>{
 const run=()=>{activeReads++;void read().then(resolve,reject).finally(()=>{activeReads--;readQueue.shift()?.();});};
 if(activeReads<3)run();else readQueue.push(run);
});}
export function invalidateOperationalFormulaReads(table?:string){for(const [key,entry] of formulaReads)if(!table||entry.table===table)formulaReads.delete(key);}
export async function readOperationalFormulas(token:string,table_key:string,rows:string[]){
 const formulas=new Map<string,FormulaOverlay>(),sources=new Map<string,FormulaSnapshot["sources"][number]>();
 const unique=[...new Set(rows)],requests=new Set<Promise<FormulaSnapshot>>(),missing:string[]=[];
 const key=(row:string)=>`${token}\u0000${table_key}\u0000${row}`;
 for(const row of unique){const entry=formulaReads.get(key(row));if(entry&&entry.expiresAt>Date.now())requests.add(entry.promise);else missing.push(row);}
 for(let offset=0;offset<missing.length;offset+=500){
  const batch=missing.slice(offset,offset+500);
  const promise=scheduleRead(async()=>{
    const response=await apiPost<ApiResponse<FormulaSnapshot>>("/reports/formulas/read",{table_key,rows:batch},token);
    if(!response.success||!isSnapshot(response.data))throw new Error("Unable to load calculated cells.");return response.data;
  });
  const entry={table:table_key,expiresAt:Date.now()+30000,promise};batch.forEach(row=>formulaReads.set(key(row),entry));requests.add(promise);
  void promise.catch(()=>{batch.forEach(row=>{if(formulaReads.get(key(row))===entry)formulaReads.delete(key(row));});});
 }
 for(const snapshot of await Promise.all(requests)){snapshot.formulas.forEach(value=>{if((formulas.get(value.id)?.version??0)<=value.version)formulas.set(value.id,value);});snapshot.sources.forEach(value=>sources.set(value.id,value));}
 return {formulas:[...formulas.values()],sources:[...sources.values()]};
}
export async function saveOperationalFormulas(token:string,table_key:string,changes:FormulaChange[]){const response=await apiPost<ApiResponse<FormulaOverlay[]>>(changes.length>1?"/reports/formulas/batch":"/reports/formulas/save",{table_key,changes},token);if(!response.success||!Array.isArray(response.data)||!response.data.every(isOverlay))throw new Error("Formula changes could not be confirmed. Refresh and review before retrying.");invalidateOperationalFormulaReads(table_key);return response.data;}
