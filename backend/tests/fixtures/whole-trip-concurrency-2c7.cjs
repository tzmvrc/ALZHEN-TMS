// Explicit local disposable endpoint only; independent real PostgreSQL sessions.
const {execFile}=require('node:child_process');const assert=require('node:assert/strict');
const database=process.argv[2];assert.equal(database,'whole_trip_2c7');
const query=sql=>new Promise((resolve,reject)=>execFile('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','55444','-U','fixture','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-c',sql],{windowsHide:true},(error,out,err)=>error?reject(Error(err)):resolve(out.trim())));
(async()=>{
 await query('SELECT fixture_trip(990,2)');
 const before=await query('SELECT count(*) FROM trips WHERE id<>fixture_id(990)');
 const remove="SELECT delete_whole_trips_v1(ARRAY[fixture_id(990),fixture_id(990)],fixture_id(1))->0->>'id'";
 const outcomes=await Promise.all([query(`BEGIN;${remove};SELECT pg_sleep(0.2);COMMIT;`),query(remove)]);
 assert.equal(outcomes[0].split(/\s+/)[0],outcomes[1]);
 assert.equal(await query('SELECT count(*) FROM trips WHERE id=fixture_id(990)'),'0');
 assert.equal(await query('SELECT count(*) FROM transaction_deletion_jobs WHERE trip_id=fixture_id(990)'),'2');
 assert.equal(await query('SELECT count(*) FROM trips'),before);
 console.log(JSON.stringify({disposable:true,concurrentWholeTripRequests:2,uniqueParents:1,stopJournals:2,idempotentAcknowledgements:true,unrelatedParentsPreserved:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
