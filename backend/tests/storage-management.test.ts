import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {podIntegrationFixture} from './fixtures/pod-integration-fixture.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('Storage deletion protects references, encoded URLs and races, audits actual removal, and is idempotent/Admin-only',async()=>{
 const db=await podIntegrationFixture();try{
  await db.exec(`create table documents(id uuid primary key,file_path text);create table storage_json_fixture(id uuid,data jsonb);alter table storage.objects add column created_at timestamptz default now();insert into profiles(id,role,first_name) values('${id(1)}','ADMIN','Storage Admin'),('${id(2)}','STAFF','Staff'),('${id(3)}','TRUCKER','Driver');`);
  await db.exec(await readFile(new URL('../migrations/2026_11_18_admin_storage_management.sql',import.meta.url),'utf8'));
  const q=async(sql:string,args:unknown[]=[])=> (await db.query<any>(sql,args)).rows;
  const object=async(n:number,path:string)=>q("insert into storage.objects(id,bucket_id,name,metadata) values($1,'trip-images',$2,'{\"size\":123,\"mimetype\":\"image/png\"}')",[id(n),path]);
  await object(10,'isolated/storage-safe.png');await object(11,'isolated/protected file.png');
  await db.exec(`insert into documents(id,file_path) values('${id(20)}','https://example.invalid/storage/v1/object/sign/trip-images/isolated%2Fprotected%20file.png?token=test');`);
  const prepare=(actor:number,n:number,path:string)=>q('select prepare_storage_delete_v1($1,$2,$3,$4::jsonb) result',[id(actor),id(30),'trip-images',JSON.stringify([{id:id(n),name:path}])]);
  await assert.rejects(()=>prepare(2,10,'isolated/storage-safe.png'),/Admin storage/);await assert.rejects(()=>prepare(3,10,'isolated/storage-safe.png'),/Admin storage/);
  await assert.rejects(()=>prepare(1,11,'isolated/protected file.png'),/Protected file/);assert.equal((await q('select count(*)::int n from storage_object_deletions'))[0].n,0);
  await assert.rejects(()=>q('select prepare_storage_delete_v1($1,$2,$3,$4::jsonb)',[id(1),id(31),'trip-images',JSON.stringify([{id:id(10),name:'isolated/storage-safe.png'},{id:id(11),name:'isolated/protected file.png'}])]),/Protected file/);assert.equal((await q('select count(*)::int n from storage_object_deletions'))[0].n,0);
  const reserved=(await prepare(1,10,'isolated/storage-safe.png'))[0].result;assert.equal(reserved[0].state,'PENDING');
  await assert.rejects(()=>q("insert into documents(id,file_path) values($1,$2)",[id(21),'isolated/storage-safe.png']),/reserved for deletion/);
  await assert.rejects(()=>q("update storage.objects set metadata='{}' where id=$1",[id(10)]),/reserved for deletion/);
  await q('delete from storage.objects where id=$1',[id(10)]);assert.equal((await q('select state from storage_object_deletions'))[0].state,'DELETED');
  assert.equal((await q("select count(*)::int n from audit_logs where action='STORAGE_OBJECT_DELETED' and user_id=$1",[id(1)]))[0].n,1);
  await prepare(1,10,'isolated/storage-safe.png');assert.equal((await q('select count(*)::int n from storage_object_deletions'))[0].n,1);
  await assert.rejects(()=>q("insert into documents(id,file_path) values($1,$2)",[id(22),'isolated/storage-safe.png']),/no longer exists/);
  await object(12,'isolated/storage-safe.png');await q("insert into documents(id,file_path) values($1,$2)",[id(23),'isolated/storage-safe.png']);
  const quoted='isolated/quote'+String.fromCharCode(34)+'file.png';await object(13,quoted);await q('insert into storage_json_fixture(id,data) values($1,$2::jsonb)',[id(24),JSON.stringify({attachment:quoted})]);await assert.rejects(()=>prepare(1,13,quoted),/Protected file/);
  const listed=(await q("select list_storage_objects_v1($1,'trip-images',NULL,'isolated/','IMAGE') result",[id(1)]))[0].result;assert.equal(listed.rows.length,3);assert.equal(listed.total,3);assert.equal(Number(listed.size_bytes),369);
  assert.equal((await q("select has_function_privilege('authenticated','prepare_storage_delete_v1(uuid,uuid,text,jsonb)','execute') permitted"))[0].permitted,false);
 }finally{await db.close();}
});
