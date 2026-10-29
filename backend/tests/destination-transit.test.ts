import test from 'node:test';
import assert from 'node:assert/strict';
import {podIntegrationFixture} from './fixtures/pod-integration-fixture.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('explicit next-destination travel is persisted once, scoped, sequenced and replayable',async()=>{
 const db=await podIntegrationFixture();try{
  await db.exec(`insert into profiles(id,role) values('${id(1)}','TRUCKER'),('${id(2)}','TRUCKER');insert into drivers(id,profile_id,first_name,last_name) values('${id(3)}','${id(1)}','Fixture','Owner');insert into trips(id,dispatch_number,status) values('${id(4)}','ISOLATED-TRANSIT','PLANNED');insert into trip_stops(id,trip_id,stop_sequence) values('${id(5)}','${id(4)}',1),('${id(6)}','${id(4)}',2),('${id(7)}','${id(4)}',3);insert into trip_truck_assignments(id,trip_id,driver_id,stop_scope) values('${id(8)}','${id(4)}','${id(3)}','ALL');`);
  const save=async(actor:string,key:string,input:object)=>(await db.query<any>('select submit_delivery_event_v1($1,$2,$3,$4::jsonb) result',[actor,id(8),key,JSON.stringify(input)])).rows[0].result;
  const device_time=new Date().toISOString(),gps={latitude:14,longitude:121,accuracy_meters:10,captured_at:device_time};
  await save(id(1),id(20),{type:'WAREHOUSE_ARRIVAL',device_time,gps});
  for(const [i,type] of ['LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'].entries())await save(id(1),id(21+i),{type});
  await assert.rejects(()=>save(id(1),id(30),{type:'IN_TRANSIT',stop_id:id(6)}),/preceding assigned stop/);
  // Prior-stop completion is isolated fixture state, never an operational write.
  await db.exec(`select set_config('alzhen.delivery_event_write','on',false);insert into trip_events(trip_id,assignment_id,trip_stop_id,event_type,event_time,recorded_by,verification_method) values('${id(4)}','${id(8)}','${id(5)}','STOP_DEPARTURE',clock_timestamp(),'${id(1)}','RECORDED');`);
  const first=await save(id(1),id(31),{type:'IN_TRANSIT',stop_id:id(6)});
  assert.equal(first.trip_stop_id,id(6));assert.equal(first.assignment_id,id(8));assert.ok(Date.parse(first.event_time));
  assert.equal((await save(id(1),id(31),{type:'IN_TRANSIT',stop_id:id(6)})).id,first.id);
  assert.equal((await save(id(1),id(32),{type:'IN_TRANSIT',stop_id:id(6)})).id,first.id);
  assert.equal((await db.query<any>("select count(*)::int n from trip_events where event_type='IN_TRANSIT'")).rows[0].n,1);
  await assert.rejects(()=>save(id(2),id(33),{type:'IN_TRANSIT',stop_id:id(6)}),/not available/);
  await assert.rejects(()=>save(id(1),id(34),{type:'IN_TRANSIT',stop_id:id(7)}),/preceding assigned stop/);
  const arrival=await save(id(1),id(35),{type:'ARRIVED',stop_id:id(6),device_time,gps});assert.equal(arrival.event_type,'ARRIVED');
 }finally{await db.close();}
});
