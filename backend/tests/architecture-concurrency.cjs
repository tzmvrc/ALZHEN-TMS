// Disposable database only. Two PostgreSQL sessions race real installed RPCs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFile,execFileSync}=require('node:child_process');
const database=process.argv[2];assert.match(database??'',/^architecture_[a-z0-9_]+$/);
const binary='C:/Program Files/PostgreSQL/18/bin/psql.exe',args=['-X','-w','-h','127.0.0.1','-p','55439','-U','fixture_admin','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-f','-'];
const options={encoding:'utf8',windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}};
const sql=text=>execFileSync(binary,args,{...options,input:text,stdio:['pipe','pipe','pipe']}).trim();
const expected=fs.readFileSync(path.join(process.env.TEMP,'alzhen-current-architecture-fixture.txt'),'utf8').trim();
assert.equal(path.normalize(sql('SHOW data_directory')).toLowerCase(),path.normalize(expected).toLowerCase());
// A fresh, empty restored fixture is required. No production records are copied.
assert.equal(sql('SELECT count(*) FROM public.trips'),'0');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
sql(`INSERT INTO auth.users(id)VALUES('${uuid(1)}'); INSERT INTO profiles(id,role,is_admin)VALUES('${uuid(1)}','ADMIN',true);
INSERT INTO trips(id,dispatch_number,trip_number)VALUES('${uuid(10)}','CONCURRENCY',1),('${uuid(20)}','CONCURRENCY',2);
INSERT INTO trucks(id,plate_number,capacity_cbm)VALUES('${uuid(5)}','RACE-A',50),('${uuid(6)}','RACE-B',50);
INSERT INTO trip_truck_assignments(id,trip_id,truck_id,assignment_type)VALUES('${uuid(40)}','${uuid(10)}','${uuid(5)}','PRIMARY'),('${uuid(41)}','${uuid(10)}','${uuid(6)}','ADDITIONAL');
INSERT INTO trip_line_items(id,trip_id,quantity,cbm)VALUES('${uuid(30)}','${uuid(10)}',10,50);`);
function concurrent(text){return new Promise(resolve=>{const p=execFile(binary,args,options,(error,stdout,stderr)=>resolve({ok:!error,stdout,stderr}));p.stdin.end(text);});}
async function main(){
 const allocation=assignment=>`SELECT save_trip_cargo_allocations_v1('${uuid(1)}','${uuid(10)}','[{"assignment_id":"${uuid(assignment)}","trip_line_item_id":"${uuid(30)}","quantity":8,"allocated_cbm":40,"expected_version":0}]');`;
 const races=await Promise.all([concurrent(allocation(40)),concurrent(allocation(41))]);
 assert.equal(races.filter(result=>result.ok).length,1,JSON.stringify(races));assert.equal(sql('SELECT sum(allocated_cbm) FROM trip_cargo_allocations'),'40');
 const deletion=`SELECT delete_whole_trips_v1(ARRAY['${uuid(20)}'::uuid],'${uuid(1)}');`;
 const deletes=await Promise.all([concurrent(deletion),concurrent(deletion)]);
 assert.equal(deletes.filter(result=>result.ok).length,2,JSON.stringify(deletes));
 assert.equal(sql(`SELECT count(*) FROM transaction_deletion_jobs WHERE trip_id='${uuid(20)}'`),'1');
 assert.equal(sql(`SELECT count(*) FROM trips WHERE id='${uuid(10)}'`),'1');
 console.log(JSON.stringify({disposable:true,concurrentAllocationConservesCargo:true,duplicateWholeTripDeleteIdempotent:true,siblingPreserved:true,productionWrites:0}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
