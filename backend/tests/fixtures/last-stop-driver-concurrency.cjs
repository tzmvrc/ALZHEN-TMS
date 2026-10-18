// Disposable PostgreSQL only. Real independent transactions and lock barriers.
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const database=process.argv[2],directory=process.argv[3];
assert.match(database??'',/^whole_trip_[a-z0-9_]+$/);
assert.match(path.basename(directory??''),/^alzhen-planned-routes-[a-f0-9]+$/);
const args=['-X','-w','-qAt','-h','127.0.0.1','-p','55443','-U','fixture','-d',database,'-v','ON_ERROR_STOP=1','-f','-'];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function client(sql,keepOpen=false){
 const child=spawn('C:/Program Files/PostgreSQL/18/bin/psql.exe',args,{windowsHide:true});let out='',err='';
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out:out.trim(),err}));});
 child.stdin.write(sql+'\n');if(!keepOpen)child.stdin.end();
 return {child,done,output:()=>out};
}
async function query(sql){const r=await client(sql).done;assert.equal(r.code,0,r.err);return r.out;}
async function until(predicate,label){const deadline=Date.now()+5000;while(Date.now()<deadline){if(await predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error(`Timed out: ${label}`);}
(async()=>{
 assert.equal(path.normalize(await query('SHOW data_directory')).toLowerCase(),path.normalize(directory).toLowerCase());
 let passed=0;
 // Earlier status submission commits before deletion's ownership checks.
 for(const [n,attachment] of [[601,false],[602,true]]){
  await query(`SELECT fixture_trip(${n},1);DELETE FROM driver_trip_updates WHERE trip_id='${id(n)}';`);
  const writer=client(`BEGIN;INSERT INTO driver_trip_updates VALUES('${id(n*100+98)}','${id(n)}','${id(3)}',NULL,${attachment?"'legacy/pod.jpg'":'NULL'});\n\\echo HELD`,true);
  await until(()=>writer.output().includes('HELD'),'writer acquired child-table lock');
  const deletion=client(`SET application_name='phase22_delete_${n}';SELECT delete_transaction_with_cleanup_v1('${id(n)}','${id(n*10+1)}','${id(1)}');`);
  await until(async()=>await query(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='phase22_delete_${n}' AND wait_event_type='Lock')`)==='t','delete blocked behind writer');
  writer.child.stdin.end('COMMIT;\n');assert.equal((await writer.done).code,0);
  const r=await deletion.done;
  assert.equal(r.code,attachment?3:0,r.err);
  if(attachment)assert.match(r.err,/Legacy driver POD attachments/);
  assert.equal(await query(`SELECT (SELECT count(*) FROM trips WHERE id='${id(n)}')||':'||(SELECT count(*) FROM driver_trip_updates WHERE trip_id='${id(n)}')||':'||(SELECT count(*) FROM transaction_deletion_jobs WHERE trip_id='${id(n)}')`),attachment?'1:1:0':'0:0:1');
  passed++;
 }
 // Deletion wins: a late status writer blocks, then its FK rejects the removed parent.
 const n=603;await query(`SELECT fixture_trip(${n},1);`);
 const deletion=client(`BEGIN;SELECT delete_transaction_with_cleanup_v1('${id(n)}','${id(n*10+1)}','${id(1)}');\n\\echo HELD`,true);
 await until(()=>deletion.output().includes('HELD'),'delete before commit');
 const writer=client(`SET application_name='phase22_late_writer';INSERT INTO driver_trip_updates VALUES('${id(n*100+98)}','${id(n)}','${id(3)}',NULL,NULL);`);
 await until(async()=>await query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='phase22_late_writer' AND wait_event_type='Lock')")==='t','late writer blocked');
 deletion.child.stdin.end('COMMIT;\n');assert.equal((await deletion.done).code,0);
 const late=await writer.done;assert.equal(late.code,3);assert.match(late.err,/foreign key constraint/);
 assert.equal(await query(`SELECT count(*) FROM driver_trip_updates WHERE trip_id='${id(n)}'`),'0');passed++;
 console.log(JSON.stringify({disposable:true,independentTransactionRaceCases:passed,failed:0,barriers:'pg_stat_activity lock waits; no timing assumption',liveWrites:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
