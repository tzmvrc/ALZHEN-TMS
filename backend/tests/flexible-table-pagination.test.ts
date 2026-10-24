import test from "node:test";
import assert from "node:assert/strict";
import {supabaseAdmin} from "../src/config/supabase.js";
import {getTable} from "../src/services/flexible-table.service.js";

test("custom table pages do not load all rows; off-page formula sources remain table-scoped",async()=>{
 const tableId="f0241024-0000-4000-9000-000000000001",owner="f0241024-0000-4000-9000-000000000002",column="f0241024-0000-4000-9000-000000000003";
 const row=(n:number)=>`f0241024-0000-4000-9000-${String(n+10).padStart(12,"0")}`;
 const calls:Array<{table:string;filters:Record<string,unknown>;range?:number[];search?:string}>=[];
 const original=supabaseAdmin.from;
 (supabaseAdmin as any).from=(table:string)=>{
  const call={table,filters:{}} as (typeof calls)[number];calls.push(call);
  const query:any={select:()=>query,order:()=>query,is:()=>query,eq:(key:string,value:unknown)=>{call.filters[key]=value;return query;},in:(key:string,value:unknown)=>{call.filters[key]=value;return query;},or:()=>query,ilike:(key:string,value:string)=>{call.search=`${key}:${value}`;return query;},range:(a:number,b:number)=>{call.range=[a,b];return query;},maybeSingle:()=>query,then:(resolve:any)=>{
   const ids=call.filters.row_id as string[]|undefined;
   const result=table==="flex_tables"?{id:tableId,table_kind:"CUSTOM",created_by:owner,settings:{},archived_at:null}
    :table==="flex_columns"?[{id:column,table_id:tableId}]
    :table==="v_flex_row_search"?Array.from({length:25},(_,i)=>({id:row(i+50),table_id:tableId}))
    :table==="flex_rows"?[{id:row(9999),table_id:tableId}]
    :table==="flex_cells"?(ids??[]).map(id=>({id:`cell:${id}`,row_id:id,column_id:column,value:3,formula:id===row(50)?{expression:"=A10000",references:{A10000:{rowId:row(9999),columnId:column}}}:null}))
    :[];
   return Promise.resolve({data:result,error:null,count:10000}).then(resolve);
  }};return query;
 };
 try{
  const result=await getTable({id:owner,role:"ADMIN"},tableId,{page:"3",limit:"25",search:"Quezon"});
  assert.equal(result.rows.length,25);assert.equal(result.pagination.total,10000);assert.equal(result.formula_sources.length,1);assert.equal(result.formula_sources[0].id,row(9999));
  const page=calls.find(c=>c.table==="v_flex_row_search")!;assert.deepEqual(page.range,[50,74]);assert.equal(page.search,"_search_text:%Quezon%");
  for(const call of calls.filter(c=>c.table==="flex_rows")){assert.equal(call.filters.table_id,tableId);assert.deepEqual(call.filters.id,[row(9999)]);}
  assert.equal(calls.filter(c=>c.table==="v_flex_row_search").length,1);
  assert.ok(calls.filter(c=>c.table==="flex_cells").every(c=>(c.filters.row_id as string[]).length<=25));
 }finally{supabaseAdmin.from=original;}
});
