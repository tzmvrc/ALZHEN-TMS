import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('atomic device registration queues Auth recipient once, survives session expiry, re-alerts after forget, and rolls back on queue failure',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid,email text);create table profiles(id uuid primary key,role text,deactivated_at timestamptz);create table admin_staff_session_days(session_hash text primary key,profile_id uuid,role text,expires_at timestamptz,created_at timestamptz default now());create table trucker_active_sessions(profile_id uuid primary key,session_hash text,created_at timestamptz default now(),updated_at timestamptz default now());create table audit_logs(user_id uuid,action text,entity_type text,entity_id uuid,new_data jsonb);insert into profiles values('${id(1)}','STAFF',null),('${id(2)}','ADMIN',null);insert into auth.users values('${id(1)}','account@example.invalid');`);
 for(const file of ['2026_10_26_device_session_security.sql','2026_11_21_login_security_notifications.sql','2026_11_22_atomic_device_security.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const register=async(n:number,device=id(50))=>{const hash=String(n).padStart(64,'a');await db.query("insert into admin_staff_session_days(session_hash,profile_id,role,expires_at) values($1,$2,'STAFF',now()+interval '1 day')",[hash,id(1)]);await db.query('select register_device_session_v1($1,$2,$3,$4::jsonb)',[id(1),hash,id(n+100),JSON.stringify({device_identifier:device,browser_name:'Chrome',operating_system:'Windows'})]);};
 const count=async()=> (await db.query<any>('select count(*)::int n from login_security_notifications')).rows[0].n;
 await register(1);await register(2);assert.equal(await count(),1);assert.equal((await db.query<any>('select recipient from login_security_notifications')).rows[0].recipient,'account@example.invalid');
 await db.exec("update device_sessions set expires_at=now()-interval '1 hour'");await register(3);assert.equal(await count(),1);
 const session=(await db.query<any>('select id from device_sessions limit 1')).rows[0].id;
 await db.query('select forget_login_device_v1($1,$2,$3)',[id(2),id(1),session]);await register(4);assert.equal(await count(),2);
 await register(5,id(51));assert.equal(await count(),3);
 await db.exec(`create function fail_security_queue() returns trigger language plpgsql as $$begin raise exception 'queue unavailable';end$$;create trigger fixture_failure before insert on login_security_notifications for each row execute function fail_security_queue();`);
 await assert.rejects(()=>register(6,id(52)),/queue unavailable/);assert.equal((await db.query<any>("select count(*)::int n from device_sessions where device_identifier=$1",[id(52)])).rows[0].n,0);
 assert.equal((await db.query<any>("select has_function_privilege('authenticated','forget_login_device_v1(uuid,uuid,uuid)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
