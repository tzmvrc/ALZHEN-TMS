import assert from "node:assert/strict";
import test from "node:test";
import {parseTrackerPageQuery,trackerPageRequest} from "../src/services/tracker-pagination.js";

test("Tracker query validates bounds, sorting, filters and literal search before database access",()=>{
 assert.equal(parseTrackerPageQuery({}).limit,50);
 for(const input of [{page:"0"},{page:"-1"},{page:"1.5"},{limit:"101"},{limit:["1"]},{sort_by:"cells"},{sort_order:"sideways"},{filter_by:"trips.id"},{filter:"x"},{search:"*"},{search:"a".repeat(101)}]) assert.throws(()=>parseTrackerPageQuery(input));
});
test("Tracker page reads only a requested stable ID range with server filters, sort and one count",async()=>{
 const calls:unknown[][]=[];
 const query:any={};
 for(const name of ["select","or","eq","order"])query[name]=(...args:unknown[])=>{calls.push([name,...args]);return query;};
 query.range=(...args:unknown[])=>{calls.push(["range",...args]);return Promise.resolve({data:[{trip_stop_id:"stop-2"}],count:125,error:null});};
 const client={from:(table:string)=>{assert.equal(table,"v_transmittal_tracker_page");return query;}};
 const result=await trackerPageRequest(client,parseTrackerPageQuery({page:"3",limit:"25",search:"DR-2",sort_by:"delivered_to",sort_order:"desc",filter_by:"status",filter:"COMPLETE",reference:"REF-2"}));
 assert.deepEqual(calls.at(-1),["range",50,74]);assert.deepEqual(calls[0],["select","trip_stop_id",{count:"exact"}]);
 assert.ok(calls.some(c=>c[0]==="or"&&String(c[1]).includes("status.ilike")));
 assert.ok(calls.some(c=>c[0]==="eq"&&c[1]==="transmittal_ref"&&c[2]==="REF-2"));
 assert.deepEqual(calls.filter(c=>c[0]==="order").map(c=>c[1]),["delivered_to","trip_stop_id"]);
 assert.equal(result.data[0].trip_stop_id,"stop-2");
});

test("actual Tracker service scopes every source stop read to the page and never falls back on a missing view",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {getTracker}=await import("../src/services/transmittal-tracker.service.js");
 const fields=["warehouse_code_override","delivered_to_override","plate_number_override","delivery_receipt_no_override","sales_order_no_override","transmittal_ref","date_created_override","tracker_status","lbc_waybill_no","lbc_shipping_date","tracker_remarks","loading_date_override","delivery_date_override"];
 const original=supabaseAdmin.from;const reads:Array<{table:string;filters:Record<string,unknown>}> = [];let missing=false;
 (supabaseAdmin as any).from=(table:string)=>{
  const filters:Record<string,unknown>={};reads.push({table,filters});
  const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q;},is:()=>q,order:()=>q,range:()=>q,in:(key:string,value:unknown)=>{filters[key]=value;return q;}};
  const result=()=>{
   if(table==="flex_tables")return {data:{id:"tracker",created_by:"admin",settings:{system_key:"alzhen_transmittal_tracker_v1"}},error:null};
   if(table==="v_transmittal_tracker_page")return {data:missing?null:[{trip_stop_id:"stop-2"}],count:3,error:missing?{code:"42P01"}:null};
   if(table==="flex_columns")return {data:fields.map(key=>({id:key,binding_scope:"STOP",value_type:key.includes("date")||key==="lbc_shipping_date"?"DATE":"TEXT",settings:{system_key:key}})),error:null};
   if(table==="trip_stops"){assert.deepEqual(filters.id,["stop-2"]);return {data:[{id:"stop-2",trip_id:"trip",stop_sequence:2,delivery_status:"Completed",dr_number:"DR-SECOND"}],error:null};}
   if(table==="trips")return {data:[{id:"trip"}],error:null};
   return {data:[],error:null};
  };
  q.maybeSingle=async()=>result();q.then=(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject);return q;
 };
 try {
  const result=await getTracker({id:"admin",role:"ADMIN"},undefined,undefined,{page:"2",limit:"1"});
  assert.deepEqual(result.rows.map(r=>r.trip_stop_id),["stop-2"]);assert.equal(result.rows[0].delivery_receipt_no,"DR-SECOND");assert.equal(result.pagination?.total,3);
  reads.length=0;missing=true;await assert.rejects(getTracker({id:"admin",role:"ADMIN"},undefined,undefined,{page:"1"}),/pagination migration is pending/);
  assert.ok(!reads.some(read=>read.table==="trip_stops"));
 } finally{supabaseAdmin.from=original;}
});
