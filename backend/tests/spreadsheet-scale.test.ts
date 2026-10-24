import test from "node:test";
import assert from "node:assert/strict";
import {postgrestBatches} from "../src/utils/postgrest-batches.js";
import {appendSpreadsheetRows} from "../../frontend/src/services/spreadsheet-pages.js";
import {collectSelectionPages} from "../../frontend/src/services/spreadsheet-selection.js";
import {PGlite} from "@electric-sql/pglite";
import {getReportRowIdentity} from "../../frontend/src/services/report-row-identity.js";

test("POD files and records sharing a delivery stop retain distinct row identities",()=>{
 const base={trip_id:"trip",trip_stop_id:"stop",pod_record_id:"pod"};
 assert.notEqual(getReportRowIdentity("pod-drive-files",{...base,pod_drive_file_id:"file-a"}),getReportRowIdentity("pod-drive-files",{...base,pod_drive_file_id:"file-b"}));
 assert.notEqual(getReportRowIdentity("pod-status",base),getReportRowIdentity("pod-status",{...base,pod_record_id:"other"}));
});

test("long physical IDs are URL-byte bounded without omissions",()=>{
 const ids=Array.from({length:500},(_,i)=>`trip:${String(i).padStart(36,"0")}:stop:${"a".repeat(36)}:line:${"b".repeat(36)}:assignment:${"c".repeat(36)}`);
 const batches=postgrestBatches(ids);
 assert.deepEqual(batches.flat(),ids);assert.ok(batches.length>5);
 for(const batch of batches)assert.ok(batch.reduce((n,id)=>n+encodeURIComponent(JSON.stringify(id)).length+3,0)<=5000);
});

test("overlapping pages preserve confirmed edits and stable IDs across 10,000 rows",()=>{
 const existing=Array.from({length:5000},(_,i)=>({id:String(i),value:i}));existing[4999].value=99999;
 const incoming=Array.from({length:5001},(_,i)=>({id:String(i+4999),value:i}));
 const result=appendSpreadsheetRows(existing,incoming,row=>row.id);
 assert.equal(result.length,10000);assert.equal(result[4999].value,99999);assert.equal(new Set(result.map(row=>row.id)).size,10000);
});

test("sheet-wide selection collects identities beyond loaded rows and rejects boundary changes",async()=>{
 const rows=Array.from({length:10001},(_,i)=>({id:String(i)}));let requests=0;
 const selected=await collectSelectionPages(async page=>{requests++;return {rows:rows.slice((page-1)*100,page*100),pagination:{total:rows.length,totalPages:101}};},row=>row.id);
 assert.equal(selected.length,10001);assert.equal(requests,101);
 await assert.rejects(collectSelectionPages(async page=>({rows:[{id:"same"}],pagination:{total:page===1?2:3,totalPages:2}}),row=>row.id),/changed/);
 await assert.rejects(collectSelectionPages(async()=>({rows:[],pagination:{total:100,totalPages:2}}),row=>row.id),/incomplete/);
});

test("isolated PostgreSQL fixture pages, searches and sorts 30,000 records with an index",async()=>{
 const db=new PGlite();try{
 await db.exec(`create table performance_demo(id integer primary key, name text, loading_date date, status text);
 insert into performance_demo select n,'DEMO Philippine delivery '||lpad(n::text,5,'0'),date '2026-10-01'+(n%30),case when n%3=0 then 'COMPLETED' else 'IN_PROGRESS' end from generate_series(1,30000)n;
 create index performance_demo_status_date on performance_demo(status,loading_date desc,id);analyze performance_demo;`);
 const started=performance.now();
 const page=await db.query<{id:number}>("select id from performance_demo where status='IN_PROGRESS' order by loading_date desc,id limit 50 offset 10000");
 assert.equal(page.rows.length,50);
 const search=await db.query<{id:number}>("select id from performance_demo where name ilike '%dElIvErY 29999%'");assert.deepEqual(search.rows,[{id:29999}]);
 const plan=await db.query<Record<string,string>>("explain select id from performance_demo where status='IN_PROGRESS' order by loading_date desc,id limit 50");
 assert.match(JSON.stringify(plan.rows),/performance_demo_status_date/);
 console.log(JSON.stringify({isolated_records:30000,paged_search_and_explain_ms:Math.round(performance.now()-started)}));
 }finally{await db.close();}
});
