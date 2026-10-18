// Explicitly local/disposable; never reads application environment credentials.
const {execFile}=require('node:child_process');
const assert=require('node:assert/strict');
const database=process.argv[2];assert.match(database??'',/^operations_reliability(_final|_checked)?$/);
const query=sql=>new Promise((resolve,reject)=>{
 execFile('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','55444','-U','fixture','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-c',sql],{windowsHide:true},(error,out,err)=>error?reject(Error(err)):resolve(out.trim()));
});
(async()=>{
 const submit="SELECT fixture_submit(1,900,'BACKLOAD',20)->>'id'";
 const results=await Promise.all([query(`BEGIN;${submit};SELECT pg_sleep(0.2);COMMIT;`),query(submit)]);
 const ids=results.map(result=>result.split(/\s+/).find(x=>/^[a-f0-9-]{36}$/.test(x)));
 assert.equal(ids[0],ids[1]);assert.ok(ids[0]);
 assert.equal(await query("SELECT count(*) FROM operations_submission_requests WHERE request_id=fixture_id(900)"),'1');
 const parent=ids[0];
 const reserve=n=>`SELECT reserve_operations_receipt_v1(fixture_id(1),fixture_id(${n}),'BACKLOAD','${parent}','p.png','image/png',100,repeat('f',64))->>'id'`;
 const uploads=await Promise.allSettled(Array.from({length:22},(_,n)=>query(reserve(1000+n))));
 assert.equal(uploads.filter(r=>r.status==='fulfilled').length,20);
 assert.equal(uploads.filter(r=>r.status==='rejected'&&/twenty images/.test(r.reason.message)).length,2);
 const repeated=await Promise.all([query(reserve(1000)),query(reserve(1000))]);assert.equal(repeated[0],repeated[1]);
 assert.equal(await query(`SELECT count(*) FROM report_receipts WHERE backload_id='${parent}'`),'20');
 const separate=await Promise.all([query("SELECT fixture_submit(1,901,'OFFLOAD',20)->>'id'"),query("SELECT fixture_submit(1,902,'OFFLOAD',20)->>'id'")]);
 assert.notEqual(separate[0],separate[1]);
 let recordDeletionRaces=0;
 if(database.endsWith('_checked'))for(const [kind,key] of [['OFFLOAD',920],['BACKLOAD',930]]){
  const report=await query(`SELECT fixture_submit(1,${key},'${kind}',20)->>'id'`);
  const path=await query(`SELECT reserve_operations_receipt_v1(fixture_id(1),fixture_id(${key+1}),'${kind}','${report}','r.png','image/png',100,repeat('a',64))->>'storage_path'`);
  await query(`INSERT INTO storage.objects VALUES('report-receipts','${path}');SELECT complete_operations_receipt_v1(fixture_id(1),fixture_id(${key+1}));`);
  const remove=`SELECT delete_${kind.toLowerCase()}_with_cleanup_v1('${report}',fixture_id(1))->>'id'`;
  const jobs=await Promise.all([query(`BEGIN;${remove};SELECT pg_sleep(0.2);COMMIT;`),query(remove)]);
  assert.equal(jobs[0].split(/\s+/)[0],jobs[1]);
  assert.equal(await query(`SELECT count(*) FROM ${kind.toLowerCase()}_deletion_jobs WHERE ${kind.toLowerCase()}_id='${report}'`),'1');
  recordDeletionRaces++;
 }
 assert.equal(await query('SELECT count(*) FROM trips'),'2');assert.equal(await query('SELECT count(*) FROM trip_stops'),'3');
 console.log(JSON.stringify({disposable:true,concurrentSubmissionReplay:true,legitimateSeparateReports:true,concurrentUploads:22,accepted:20,rejected:2,uploadReplay:true,recordDeletionRaces,parentsAndSiblingsPreserved:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
