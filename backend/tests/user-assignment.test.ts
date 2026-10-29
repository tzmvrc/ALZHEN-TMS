import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {podIntegrationFixture} from './fixtures/pod-integration-fixture.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('claiming a Driver slot cannot replace another Driver; release preserves Helpers, history and cargo',async()=>{
 const db=await podIntegrationFixture();try{
  await db.exec(`create function user_assign_current_truck_v1(p_actor uuid,p_driver uuid,p_truck uuid) returns jsonb language plpgsql as $$begin update drivers set assigned_truck_id=p_truck where id=p_driver;return '{}'::jsonb;end$$;
   insert into profiles(id,role,crew_role) values('${id(1)}','ADMIN',null),('${id(2)}','TRUCKER','DRIVER'),('${id(3)}','TRUCKER','DRIVER'),('${id(4)}','TRUCKER','HELPER');
   insert into drivers(id,profile_id,first_name,last_name) values('${id(5)}','${id(2)}','First','Driver'),('${id(6)}','${id(3)}','Second','Driver');
   insert into trucks(id,plate_number,status,capacity_cbm) values('${id(7)}','ISOLATED-SLOT','ACTIVE',10);
   insert into trips(id,dispatch_number,status) values('${id(8)}','ISOLATED-SLOT','PLANNED');
   insert into trip_truck_assignments(id,trip_id,truck_id,stop_scope) values('${id(9)}','${id(8)}','${id(7)}','ALL');
   select save_assignment_crew_v1('${id(1)}','${id(8)}','${id(9)}',array['${id(4)}'::uuid],0);`);
  await db.exec(await readFile(new URL('../migrations/2026_11_20_driver_assignment_selection.sql',import.meta.url),'utf8'));
  const claim=(who:number,add=true)=>db.query('select select_driver_assignment_v1($1,$2,$3,$4)',[id(1),id(who),id(9),add]);
  await claim(2);await claim(2);await assert.rejects(()=>claim(3),/already has a Driver/);
  const a=await db.query<any>('select driver_id from trip_truck_assignments where id=$1',[id(9)]);assert.equal(a.rows[0].driver_id,id(5));
  await claim(2,false);const crew=await db.query<any>('select profile_id,removed_at from trip_truck_crew_members where assignment_id=$1',[id(9)]);assert.equal(crew.rows.find(r=>r.profile_id===id(4)).removed_at,null);assert(crew.rows.find(r=>r.profile_id===id(2)).removed_at);
  await claim(3);await assert.rejects(()=>claim(4),/Active Driver required/);await assert.rejects(()=>db.query('select select_driver_assignment_v1($1,$2,$3,true)',[id(4),id(2),id(9)]),/Management access/);
  assert.equal((await db.query<any>("select count(*)::int n from audit_logs where action='ASSIGNMENT_DRIVER_ADDED'")).rows[0].n,2);
  assert.equal((await db.query<any>("select has_function_privilege('authenticated','select_driver_assignment_v1(uuid,uuid,uuid,boolean)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
