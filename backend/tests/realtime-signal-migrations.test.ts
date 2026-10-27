import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('private realtime signals ignore activity-only heartbeats, preserve scoped report changes, and deny direct browser reads',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create table profiles(id uuid primary key,locked_at timestamptz,deactivated_at timestamptz,role text);create table device_sessions(id uuid primary key,profile_id uuid,revoked_at timestamptz,status text,expires_at timestamptz,last_activity_at timestamptz);create table admin_change_signals(topic text primary key,revision uuid default gen_random_uuid(),changed_at timestamptz default now());create table trips(id uuid primary key);`);
  for(const table of ['trip_images','loading_reports','unloading_reports','backloads','offloads','demurrages','incidents','report_receipts','pod_records'])await db.exec(`create table ${table}(id uuid primary key,trip_id uuid,remarks text)`);
  for(const file of ['2026_10_27_device_security_realtime.sql','2026_10_27_trip_operational_realtime.sql'])await db.exec((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/ALTER PUBLICATION[^;]+;/g,''));
  await db.query('insert into profiles(id,role) values($1,$2)',[id(1),'TRUCKER']);await db.query('insert into device_sessions(id,profile_id,status) values($1,$2,$3)',[id(2),id(1),'ACTIVE']);
  const revision=async()=>(await db.query<any>('select revision from device_security_signals')).rows[0].revision;
  const before=await revision();await db.query('update device_sessions set last_activity_at=now()');assert.equal(await revision(),before,'Heartbeats must not generate security refresh loops');
  await db.query("update device_sessions set revoked_at=now(),status='REVOKED'");assert.notEqual(await revision(),before);
  const revoked=await revision();await db.query('update profiles set locked_at=now()');assert.notEqual(await revision(),revoked);
  await db.query('insert into trips(id) values($1),($2)',[id(10),id(11)]);await db.query('insert into backloads(id,trip_id) values($1,$2)',[id(20),id(10)]);
  await db.query('update backloads set trip_id=$1 where id=$2',[id(11),id(20)]);assert.deepEqual(new Set((await db.query<any>('select trip_id from trip_operational_signals')).rows.map(r=>r.trip_id)),new Set([id(10),id(11)]));
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from device_security_signals'),/permission denied/);await assert.rejects(db.query('select * from trip_operational_signals'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
