import assert from "node:assert/strict";
import test, {beforeEach,afterEach} from "node:test";
let restoreRpc:(()=>void)|undefined;
beforeEach(async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js"),original=supabaseAdmin.rpc;
 // This read-focused fixture has no saved operational events. Never call live RPCs.
 (supabaseAdmin as any).rpc=async(name:string)=>{assert.equal(name,"read_confirmed_operational_state_batch_v1");return {data:[],error:null};};
 restoreRpc=()=>{supabaseAdmin.rpc=original;};
});
afterEach(()=>restoreRpc?.());

process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-report-read";
process.env.SUPABASE_ANON_KEY="isolated-report-read";

test("Master List reads preserve physical rows and source fields without unused computed search columns",async()=>{
  const {supabaseAdmin}=await import("../src/config/supabase.js");
  const {getReportData}=await import("../src/services/report.service.js");
  const {MASTER_LIST_COLUMNS}=await import("../src/config/master-list-columns.js");
  const from=supabaseAdmin.from, calls:Array<{table:string;select:string}>=[];
  const trip="123e4567-e89b-42d3-a456-426614174000",stop="223e4567-e89b-42d3-a456-426614174000";
  const line="323e4567-e89b-42d3-a456-426614174000";
  (supabaseAdmin as any).from=(table:string)=>{
    const call={table,select:""};calls.push(call);let limit=200;
    const q:any={select:(value:string)=>{call.select=value;return q;},limit:(value:number)=>{limit=value;return q;},in:()=>q,eq:()=>q,is:()=>q,not:()=>q,order:()=>q,range:()=>q,
      then:(resolve:any,reject:any)=>Promise.resolve({error:null,count:1,data:limit===0?[]:table==="v_trip_master_csv"?[{trip_id:trip,_trip_id:trip,_trip_stop_id:stop,_trip_line_item_id:line,_product_id:null,dispatch_number:"SOURCE-1",customer_model:"Model",quantity:"2",cbm:"0.246913578246913578",ph_truck_reference:"PH-1",transmittal_ref:"REF-1",transmittal_ref_version:4}]:table==="trips"?[{id:trip,dispatch_number:"SOURCE-1",trip_reference:"TRIP-1"}]:table==="trip_line_items"?[{id:line,quantity:"2",cbm:"0.246913578246913578",unit_cbm:"0.123456789123456789"}]:[]}).then(resolve,reject)};
    return q;
  };
  try{
    const report=await getReportData("dispatch-monitoring",{source_lines:"true",page:"1",limit:"200",sort_by:"loading_date",sort_order:"desc"});
    assert.equal(report.rows.length,1);assert.equal(report.pagination.total,1);
    assert.equal(report.rows[0].trip_line_item_id,line);assert.equal(report.rows[0].trip_stop_id,stop);
    assert.equal(report.rows[0].cbm,"0.246913578246913578");assert.equal(report.rows[0].ph_truck_reference,"PH-1");
    assert.equal(report.rows[0].transmittal_ref_version,4);
    const selection=calls.find(call=>call.table==="v_trip_master_csv"&&call.select!=="trip_id")!.select.split(",");
    for(const column of MASTER_LIST_COLUMNS.filter(column=>!["incident_report","incident_boxes","incident_details"].includes(column.key)))assert.ok(selection.includes(column.key),column.key);
    for(const key of ["incident_report","incident_boxes","incident_details"])assert.ok(Object.hasOwn(report.rows[0],key),"Derived incident summaries remain available: "+key);
    assert.ok(!selection.includes("*")&&!selection.includes("_search_text")&&!selection.some(key=>key.startsWith("_filter_")));
  }finally{supabaseAdmin.from=from;}
});

test("Master List skips duplicate view counts on short pages and counts full or empty later pages separately with the same scope",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");
 const {getReportData}=await import("../src/services/report.service.js");
 const original=supabaseAdmin.from,trip="123e4567-e89b-42d3-a456-426614174000";
 try{
  for(const [total,page,expectedHead] of [[56,1,0],[400,1,1],[201,2,0],[200,2,1]]){
   const reads:Array<{head:boolean;count?:string;filters:any[];orders:number}>=[];
   (supabaseAdmin as any).from=(table:string)=>{
    const read={head:false,count:undefined as string|undefined,filters:[] as any[],orders:0};let from=0,to=199,capability=false;
    const q:any={select:(_fields:string,options:any={})=>{read.head=Boolean(options.head);read.count=options.count;return q;},limit:()=>{capability=true;return q;},eq:(field:string,value:any)=>{read.filters.push([field,value]);return q;},in:(field:string,value:any)=>{read.filters.push([field,value]);return q;},is:()=>q,not:()=>q,or:()=>q,order:()=>{read.orders++;return q;},range:(a:number,b:number)=>{from=a;to=b;return q;},
     then:(resolve:any,reject:any)=>{
      if(table==="v_trip_master_csv"&&!capability)reads.push(read);
      const data=capability?[]:table==="v_trip_master_csv"?read.head?null:Array.from({length:Math.max(0,Math.min(to+1,total)-from)},(_,i)=>({trip_id:trip,_trip_line_item_id:`123e4567-e89b-42d3-a456-${String(from+i).padStart(12,"0")}`,dispatch_number:"D"})):table==="trips"?[{id:trip,dispatch_number:"D",trip_reference:"T"}]:[];
      return Promise.resolve({data,error:null,count:read.head?total:null}).then(resolve,reject);
     }};return q;
   };
   const result=await getReportData("dispatch-monitoring",{source_lines:"true",trip_id:trip,page,limit:200});
   assert.equal(result.pagination.total,total);
   assert.equal(reads.filter(read=>read.head).length,expectedHead);
   assert.equal(reads[0].count,undefined,"wide row reads must not request a simultaneous exact count");
   for(const read of reads)assert.ok(read.filters.some(([field,value])=>field==="trip_id"&&value===trip));
   if(expectedHead)assert.equal(reads.at(-1)!.orders,0,"count queries do not sort rows");
  }
 }finally{supabaseAdmin.from=original;}
});

test("database statement timeout is an actionable temporary report failure, not a legacy-view retry",async()=>{
  const {supabaseAdmin}=await import("../src/config/supabase.js");
  const {getReportData}=await import("../src/services/report.service.js");
  const from=supabaseAdmin.from,tables:string[]=[];
  (supabaseAdmin as any).from=(table:string)=>{tables.push(table);const q:any={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,then:(resolve:any)=>Promise.resolve({data:null,error:{code:"57014",message:"canceling statement due to statement timeout"}}).then(resolve)};return q;};
  try{
    await assert.rejects(getReportData("dispatch-monitoring",{source_lines:"true"}),(error:any)=>error.statusCode===503&&error.code==="REPORT_READ_TIMEOUT"&&/Retry loading/.test(error.message));
    assert.deepEqual(tables,["trips","v_trip_master_csv"],"Leading-trip optimization must not retry a timed-out view through legacy reports");
  }finally{supabaseAdmin.from=from;}
});
