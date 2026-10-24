import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {createFormulaEvaluator} from "../../packages/spreadsheet-formula/index.js";

test("actual formula RPC persists, recalculates, rolls back conflicts and cycles, and enforces roles",async()=>{
 const db=new PGlite();const actor="f0241024-0000-4000-9000-000000000001",trucker="f0241024-0000-4000-9000-000000000002";
 try{
  await db.exec(`create table profiles(id uuid primary key,role text);insert into profiles values('${actor}','ADMIN'),('${trucker}','TRUCKER')`);
  const original=await readFile(new URL("../migrations/2026_11_16_spreadsheet_operational_formulas.sql",import.meta.url),"utf8");
  await db.exec(original.slice(original.indexOf("CREATE TABLE public.spreadsheet_cell_formulas"),original.indexOf("ALTER TABLE public.spreadsheet_cell_formulas ENABLE")));
  await db.exec(original.slice(original.indexOf("CREATE FUNCTION public.save_spreadsheet_formulas_v1"),original.indexOf("REVOKE ALL ON FUNCTION public.save_spreadsheet_formulas_v1")));
  await db.exec(await readFile(new URL("../migrations/2026_10_24_formula_conflict_response.sql",import.meta.url),"utf8"));
  const change={row_identity:"trip:fixture",column_key:"quantity",expression:"=2+3*4",references:{},expected_version:0};
  const save=(changes:unknown[],id=actor)=>db.query<Record<string,any>>("select * from save_spreadsheet_formulas_v1($1,'trips',$2::jsonb)",[id,JSON.stringify(changes)]);
  const saved=(await save([change])).rows[0];assert.equal(saved.version,1);
  const read=await db.query<Record<string,any>>("select * from spreadsheet_cell_formulas");assert.equal(read.rows[0].formula_expression,"=2+3*4");
  const evaluate=createFormulaEvaluator([{id:"trip:fixture",cells:[{column_id:"quantity",value:null,formula:{expression:saved.formula_expression,references:{}}}]}]);assert.equal(evaluate("trip:fixture","quantity"),14);
  await assert.rejects(save([{...change,expression:"=1"}]),(error:any)=>error.code==="PT409");
  await assert.rejects(save([{...change,expression:"=A1",expected_version:1,references:{A1:{rowId:"trip:fixture",columnId:"quantity"}}}]),(error:any)=>error.code==="23514");
  await assert.rejects(save([{...change,row_identity:"trip:second"},change]),(error:any)=>error.code==="PT409");
  assert.equal((await db.query("select * from spreadsheet_cell_formulas")).rows.length,1,"A failed batch must roll back its other cells");
  await assert.rejects(save([{...change,row_identity:"trip:denied"}],trucker),(error:any)=>error.code==="42501");
  assert.equal((await db.query<Record<string,any>>("select * from spreadsheet_cell_formulas")).rows[0].version,1,"Rejected changes must preserve the confirmed expression");
 }finally{await db.close();}
});
