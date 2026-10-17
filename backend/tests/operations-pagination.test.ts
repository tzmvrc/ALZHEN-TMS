import test from "node:test";
import assert from "node:assert/strict";
import {operationsPageRequest,parseOperationsPageQuery} from "../src/services/operations-pagination.js";

test("Operations pages reject unbounded sizes, unknown sort/filter and malformed literal search",()=>{
 assert.deepEqual(parseOperationsPageQuery({}),{page:1,limit:50,search:"",filter:"All",sortBy:"date",sortOrder:"desc"});
 for(const query of [{limit:"101"},{page:"0"},{page:"1e3"},{sort_by:"table_name"},{filter:"UNKNOWN"},{sort_order:"sideways"},{search:"*"}])assert.throws(()=>parseOperationsPageQuery(query));
});
test("Operations page query filters/searches before database range with one count and stable physical IDs",()=>{
 const calls:unknown[][]=[];
 const query={select:(...args:unknown[])=>{calls.push(["select",...args]);return query;},or:(...args:unknown[])=>{calls.push(["or",...args]);return query;},eq:(...args:unknown[])=>{calls.push(["eq",...args]);return query;},order:(...args:unknown[])=>{calls.push(["order",...args]);return query;},range:(...args:unknown[])=>{calls.push(["range",...args]);return query;}};
 const client={from:(table:string)=>{assert.equal(table,"v_operations_report_page");return query;}};
 operationsPageRequest(client as unknown as Parameters<typeof operationsPageRequest>[0],parseOperationsPageQuery({page:"3",limit:"25",search:"DSP-2",filter:"Offload",sort_by:"quantity",sort_order:"asc"}));
 assert.equal(calls.filter(c=>c[0]==="select").length,1);
 assert.deepEqual(calls[0][2],{count:"exact"});
 assert.deepEqual(calls.at(-1),["range",50,74]);
 assert.ok(calls.some(c=>c[0]==="or"&&String(c[1]).includes("search_text.ilike")));
 assert.ok(calls.some(c=>c[0]==="eq"&&c[1]==="report_type"&&c[2]==="Offload"));
 assert.deepEqual(calls.filter(c=>c[0]==="order").map(c=>c[1]),["quantity","source_type","source_record_id"]);
 calls.length=0;operationsPageRequest(client as unknown as Parameters<typeof operationsPageRequest>[0],parseOperationsPageQuery({sort_by:"trip"}));
 assert.equal(calls.find(c=>c[0]==="order")?.[1],"trip_sort");
});
