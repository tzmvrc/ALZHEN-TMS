import test from "node:test";
import assert from "node:assert/strict";
import {clearApiCache,getCachedApiResponse} from "../src/services/api.service.ts";
import {fetchOperationsPage,operationsPageEndpoint,invalidateOperationsReportsCache} from "../src/services/operations-report.service.ts";
test("Operations page cache deduplicates initial requests and isolates page/search/sort/filter/session keys",async()=>{
 const original=globalThis.fetch;clearApiCache();let reads=0;
 globalThis.fetch=async()=>{reads++;await Promise.resolve();return new Response(JSON.stringify({success:true,data:{event_rows:[],pagination:{page:1,limit:50,total:0,totalPages:1}}}),{status:200});};
 try{
  const [preload,navigation]=await Promise.all([fetchOperationsPage("admin"),fetchOperationsPage("admin")]);assert.strictEqual(preload,navigation);assert.equal(reads,1);
  await fetchOperationsPage("admin");assert.equal(reads,1);
  for(const query of [{page:2},{search:"DR-2"},{filter:"Offload"},{sortBy:"quantity",sortOrder:"asc" as const}])await fetchOperationsPage("admin",query);
  await fetchOperationsPage("staff");assert.equal(reads,6);
  invalidateOperationsReportsCache();assert.equal(getCachedApiResponse(operationsPageEndpoint(),"admin"),null);
  await fetchOperationsPage("admin");assert.equal(reads,7);
 }finally{globalThis.fetch=original;clearApiCache();}
});
