export type FormulaReference={rowId:string;columnId:string};
export type CellFormula={expression:string;references:Record<string,FormulaReference>};
export class FormulaError extends Error {code:string;constructor(code:string);}
export function normalizeAddress(value:string):string;
export function columnLetters(index:number):string;
export function addressParts(address:string):{column:number;row:number;absoluteColumn:boolean;absoluteRow:boolean};
export function rangeAddresses(start:string,end:string):string[];
export function bindFormula(expression:string,rows:readonly {id:string}[],columns:readonly {id:string}[],fallback?:CellFormula["references"]):CellFormula;
export function shiftFormula(expression:string,rowDelta:number,columnDelta?:number):string;
export function evaluateFormula(formula:CellFormula,resolve:(reference:FormulaReference)=>unknown):unknown;
type Row={id:string;cells:readonly {column_id:string;value:unknown;formula?:CellFormula|null}[]};
export function formulaCellValue(rows:readonly Row[],rowId:string,columnId:string,stack?:Set<string>):unknown;
export function createFormulaEvaluator(rows:readonly Row[],columns?:readonly {id:string}[]):(rowId:string,columnId:string)=>unknown;
export function physicalRowIdentity(row:object):string|null;
export function validateFormulaSyntax(expression:string):void;
export function shiftBoundFormula(formula:CellFormula,rowDelta:number,rows:readonly {id:string}[],columns:readonly {id:string}[]):CellFormula;
export function formulaReferenceAddresses(expression:string):string[];

export function formulaDraftReferenceAddresses(expression:string):string[];
