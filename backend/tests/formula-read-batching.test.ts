import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-formula-read";
process.env.SUPABASE_ANON_KEY="isolated-formula-read";

test("formula dependency reads bound actual HTTP URLs for composite and maximum-length identities",async()=>{
 const {readSpreadsheetFormulas}=await import("../src/services/spreadsheet-formula.service.js");
 const original=globalThis.fetch;
 const uuid="123e4567-e89b-42d3-a456-426614174000";
 const rows=Array.from({length:500},(_,index)=>`trip:${uuid}:stop:${uuid}:line:${uuid}:assignment:${uuid}:extra:${index}`.padEnd(index%2?1000:220,"a"));
 const seen:string[]=[],urls:string[]=[];
 globalThis.fetch=async input=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  assert.equal(url.host,"127.0.0.1:54321");
  assert.equal(url.pathname,"/rest/v1/spreadsheet_cell_formulas");
  assert.equal(url.searchParams.get("table_key"),"eq.trips");
  assert.ok(url.href.length<8192,`oversized formula URL: ${url.href.length}`);
  urls.push(url.href);
  seen.push(...url.searchParams.get("row_identity")!.slice(4,-1).split(","));
  return new Response("[]",{headers:{"content-type":"application/json"}});
 };
 try{
  assert.deepEqual(await readSpreadsheetFormulas({profileId:uuid,role:"ADMIN"},{table_key:"trips",rows}),{formulas:[],sources:[]});
  assert.deepEqual(seen,rows,"every physical row is queried exactly once");
  assert.ok(urls.length>5,"long identities split before reaching a fixed 100-row batch");
 }finally{globalThis.fetch=original;}
});

test("a failed formula lookup remains a failure rather than silently dropping overlays",async()=>{
 const {readSpreadsheetFormulas}=await import("../src/services/spreadsheet-formula.service.js");
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({code:"42501",message:"Permission denied"}),{status:403,headers:{"content-type":"application/json"}});
 try{
  await assert.rejects(readSpreadsheetFormulas({profileId:"fixture",role:"ADMIN"},{table_key:"trips",rows:["trip:123e4567-e89b-42d3-a456-426614174000"]}),error=>{
   assert.equal((error as any).statusCode,503);
   assert.equal((error as any).code,"FORMULA_READ_UNAVAILABLE");return true;
  });
 }finally{globalThis.fetch=original;}
});
