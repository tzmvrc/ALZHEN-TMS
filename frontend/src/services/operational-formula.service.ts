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
export async function readOperationalFormulas(token:string,table_key:string,rows:string[]){const response=await apiPost<ApiResponse<FormulaSnapshot>>("/reports/formulas/read",{table_key,rows},token);if(!response.success||!isSnapshot(response.data))throw new Error("Unable to load calculated cells.");return response.data;}
export async function saveOperationalFormulas(token:string,table_key:string,changes:FormulaChange[]){const response=await apiPost<ApiResponse<FormulaOverlay[]>>(changes.length>1?"/reports/formulas/batch":"/reports/formulas/save",{table_key,changes},token);if(!response.success||!Array.isArray(response.data)||!response.data.every(isOverlay))throw new Error("Formula changes could not be confirmed. Refresh and review before retrying.");return response.data;}
