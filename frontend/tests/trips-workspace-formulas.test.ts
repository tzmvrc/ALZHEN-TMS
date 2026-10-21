import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_SHEETS, workspaceSheet, workspaceReportFromLocation } from "../src/services/trips-workspace.ts";
import { bindFormula, createFormulaEvaluator, formulaCellValue, shiftBoundFormula, FormulaError, formulaDraftReferenceAddresses } from "../src/services/spreadsheet-formula.ts";
const rows=[{id:"physical-stop-a",cells:[{column_id:"a",value:100},{column_id:"b",value:250},{column_id:"c",value:null}]},{id:"physical-stop-b",cells:[{column_id:"a",value:2},{column_id:"b",value:3},{column_id:"c",value:null}]}];
const columns=[{id:"a"},{id:"b"},{id:"c"}];
test("workspace has five unique sheets and retains existing backend projections",()=>{
 assert.deepEqual(WORKSPACE_SHEETS.map(sheet=>sheet.title),["Master List","Dispatch Monitoring","Dispatch Report","Trip Booking","Store Calling"]);
 assert.equal(new Set(WORKSPACE_SHEETS.map(sheet=>sheet.key)).size,5);
 assert.equal(WORKSPACE_SHEETS[0].report,"dispatch-monitoring");assert.equal(workspaceSheet("combined"),"trips");assert.equal(workspaceSheet("unknown"),"trips");
});
test("legacy report URLs and query bookmarks resolve without exposing a Combined sheet",()=>{
 assert.equal(workspaceReportFromLocation("/reports"),"combined");assert.equal(workspaceReportFromLocation("/reports/combined"),"combined");
 for(const sheet of WORKSPACE_SHEETS)assert.equal(workspaceReportFromLocation("/",`?sheet=${sheet.key}`),sheet.key==="trips"?"combined":sheet.report);
 assert.equal(workspaceReportFromLocation("/trips"),"combined");assert.equal(workspaceReportFromLocation("/trips/physical-trip"),undefined);
});
test("formula is separate from operational values and recalculates after confirmed source changes",()=>{
 const formula=bindFormula("=A1+B1",rows,columns);
 const withFormula=rows.map((row,index)=>index?row:{...row,cells:row.cells.map(cell=>cell.column_id==="c"?{...cell,formula}:cell)});
 assert.equal(formulaCellValue(withFormula,"physical-stop-a","c"),350);assert.equal(rows[0].cells[2].value,null);
 const changed=withFormula.map(row=>({...row,cells:row.cells.map(cell=>cell.column_id==="a"?{...cell,value:200}:cell)}));
 assert.equal(formulaCellValue(changed,"physical-stop-a","c"),450);
 assert.equal(formula.expression,"=A1+B1");
});
test("saved reference bindings survive sorting, filtering of the visible projection and column reordering",()=>{
 const saved=bindFormula("=A1+B1",rows,columns);
 const target={...rows[1],cells:rows[1].cells.map(cell=>cell.column_id==="c"?{...cell,formula:saved}:cell)};
 const evaluate=createFormulaEvaluator([target,rows[0]],[...columns].reverse());
 assert.equal(evaluate(target.id,"c"),350);assert.equal(saved.references.A1.rowId,rows[0].id);
});
test("deleting or losing access to a physical reference never rebinds it to a sibling row",()=>{
 const formula=bindFormula("=A1",rows,columns),target={...rows[1],cells:[{column_id:"c",value:null,formula}]};
 assert.throws(()=>formulaCellValue([target],target.id,"c"),(error:unknown)=>error instanceof FormulaError&&error.code==="#REF!");
});
test("safe functions, ranges, parentheses and operator precedence",()=>{
 for(const [expression,expected] of [["=(A1+B1)*2",700],["=SUM(A1:B2)",355],["=AVERAGE(A1:B1)",175],["=MIN(A1:B2)",2],["=MAX(A1:B2)",250],["=COUNT(A1:B2)",4],["=IF(A1>0,\"Yes\",\"No\")","Yes"]] as const){
  const formula=bindFormula(expression,rows,columns),target={id:"target",cells:[{column_id:"c",value:null,formula}]};
  assert.equal(formulaCellValue([...rows,target],target.id,"c"),expected);
 }
});
test("division by zero, invalid references and cycles fail safely",()=>{
 for(const [expression,code] of [["=1/0","#DIV/0!"],["=Z100","#REF!"],["=C1","#CYCLE!"]] as const){
  assert.throws(()=>{const formula=bindFormula(expression,rows,columns);return formulaCellValue([{...rows[0],cells:[...rows[0].cells.filter(cell=>cell.column_id!=="c"),{column_id:"c",value:null,formula}]}],rows[0].id,"c");},(error:unknown)=>error instanceof FormulaError&&error.code===code);
 }
});
test("fill-down shifts relative bindings while preserving absolute references",()=>{
 const original=bindFormula("=$A$1+B1",rows,columns),filled=shiftBoundFormula(original,1,rows,columns);
 assert.equal(filled.expression,"=$A$1+B2");assert.equal(filled.references.A1.rowId,rows[0].id);assert.equal(filled.references.B2.rowId,rows[1].id);
});

test("reference highlighting accepts unfinished expressions without treating quoted labels as references",()=>{
 assert.deepEqual(formulaDraftReferenceAddresses("=A1+"),["A1"]);
 assert.deepEqual(formulaDraftReferenceAddresses('=IF(A1>0,"B2",'),["A1"]);
 assert.deepEqual(formulaDraftReferenceAddresses("=SUM(A1:B2"),["A1","B1","A2","B2"]);
});
