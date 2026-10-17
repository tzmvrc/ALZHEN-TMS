// Local disposable PostgreSQL only. No Supabase/network provider/GPS calls.
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const executable='C:/Program Files/PostgreSQL/18/bin/psql.exe';
const database=process.argv[2],expectedDirectory=process.argv[3],port='55443';
assert.match(database??'',/^planned_route_[a-z0-9_]+$/);assert.match(path.basename(expectedDirectory??''),/^alzhen-planned-routes-[a-f0-9]+$/);
function query(sql){return new Promise((resolve,reject)=>{const child=spawn(executable,['-w','-h','127.0.0.1','-p',port,'-U','fixture','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',sql],{windowsHide:true});let out='',error='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>error+=d);child.once('error',reject);child.once('close',code=>code===0?resolve(out.trim()):reject(Error(error)));});}
(async()=>{
 const actual=await query('SHOW data_directory');assert.equal(path.normalize(actual).toLowerCase(),path.normalize(expectedDirectory).toLowerCase());
 await query("INSERT INTO trip_truck_assignments(id,trip_id,driver_id,truck_id) SELECT '00000000-0000-4000-8000-000000000051',trip_id,driver_id,truck_id FROM trip_truck_assignments WHERE id='00000000-0000-4000-8000-000000000050'; UPDATE trip_route_cache SET request_window=NULL,window_requests=0;");
 const assignment='00000000-0000-4000-8000-000000000051',actor='00000000-0000-4000-8000-000000000001';
 const claim=token=>`SELECT planned_route_write_v1('${actor}','${assignment}','CLAIM','${token}',planned_route_context_v1('${assignment}',false)->>'context_token',repeat('c',64),0)`;
 // First contender holds assignment/parent lock long enough for the second
 // independent psql connection to queue. Only one lease/version can succeed.
 const first=query(`BEGIN; ${claim('00000000-0000-4000-8000-000000000092')}; SELECT pg_sleep(0.5); COMMIT;`);
 const second=query(claim('00000000-0000-4000-8000-000000000093'));
 const outcomes=await Promise.all([first,second]);const results=outcomes.flatMap(out=>out.split(/\r?\n/).filter(s=>s==='t'||s==='f')).sort();assert.deepEqual(results,['f','t']);
 assert.equal(await query(`SELECT count(*) FROM trip_tracking_locations`),'0');
 console.log(JSON.stringify({disposablePostgres:true,independentConnections:2,successfulLeases:1,rejectedContenders:1,gpsRows:0}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
