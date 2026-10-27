import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('persistent device sessions bind identity, deduplicate restores, revoke one device, lock all and preserve midnight/single-trucker rules',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table profiles(id uuid primary key,role text,deactivated_at timestamptz);
   create table admin_staff_session_days(session_hash text primary key,profile_id uuid,role text,expires_at timestamptz,created_at timestamptz default now());
   create table trucker_active_sessions(profile_id uuid primary key,session_hash text,created_at timestamptz default now(),updated_at timestamptz default now());
   create table audit_logs(user_id uuid,action text,entity_type text,entity_id uuid,new_data jsonb);
   insert into profiles(id,role) values('${id(1)}','ADMIN'),('${id(2)}','STAFF'),('${id(3)}','TRUCKER');`);
  await db.exec(await readFile(new URL('../migrations/2026_10_26_device_session_security.sql',import.meta.url),'utf8'));
  const hash=(n:number)=>n.toString().padStart(64,'a');
  const register=async(user:number,n:number,role='STAFF')=>{
   if(role==='TRUCKER')await db.query('insert into trucker_active_sessions(profile_id,session_hash) values($1,$2) on conflict(profile_id) do update set session_hash=excluded.session_hash',[id(user),hash(n)]);
   else await db.query("insert into admin_staff_session_days(session_hash,profile_id,role,expires_at) values($1,$2,$3,now()+interval '1 day')",[hash(n),id(user),role]);
   await db.query('select register_device_session_v1($1,$2,$3,$4::jsonb)',[id(user),hash(n),id(100+n),JSON.stringify({browser_name:'Chrome',operating_system:'Windows',device_category:'desktop'})]);
  };
  const check=async(user:number,n:number,auth=id(100+n))=>(await db.query<{status:string}>('select check_device_session_v1($1,$2,$3,$4::jsonb) status',[id(user),hash(n),auth,'{}'])).rows[0].status;
  const manage=async(user:number,action:string,session:string|null=null)=>db.query('select manage_device_security_v1($1,$2,$3,$4)',[id(1),id(user),action,session]);
  await register(2,1);await register(2,2);
  assert.equal(await check(2,1),'ACTIVE');assert.equal(await check(2,1,id(999)),'SESSION_REVOKED');
  await db.query('select register_device_session_v1($1,$2,$3,$4::jsonb)',[id(2),hash(1),id(101),'{}']);
  assert.equal((await db.query<any>('select count(*)::int n from device_sessions')).rows[0].n,2);
  const selected=(await db.query<any>('select id from device_sessions where session_hash=$1',[hash(1)])).rows[0].id;
  await manage(2,'revoke',selected);assert.equal(await check(2,1),'SESSION_REVOKED');assert.equal(await check(2,2),'ACTIVE');
  await manage(2,'lock');assert.equal(await check(2,2),'ACCOUNT_LOCKED');
  await assert.rejects(register(2,3),/Account unavailable/);
  await manage(2,'unlock');assert.equal(await check(2,2),'SESSION_REVOKED');await register(2,4);assert.equal(await check(2,4),'ACTIVE');
  await db.query("update admin_staff_session_days set expires_at=now()-interval '1 second' where session_hash=$1",[hash(4)]);assert.equal(await check(2,4),'SESSION_REVOKED');
  await register(3,5,'TRUCKER');await register(3,6,'TRUCKER');assert.equal(await check(3,5),'SESSION_REVOKED');assert.equal(await check(3,6),'ACTIVE');
  await assert.rejects(manage(1,'lock'),/own account/);
  await assert.rejects(db.query('select manage_device_security_v1($1,$2,$3,null)',[id(2),id(3),'lock']),/Admin access required/);
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from device_sessions'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
