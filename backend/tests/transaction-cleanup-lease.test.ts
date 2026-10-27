import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('existing deletion journal gains service-only leased retries without duplicate claims',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table profiles(id uuid primary key,role text,deactivated_at timestamptz);create table transaction_deletion_jobs(id uuid primary key,state text,next_stub text);insert into profiles values('00000000-0000-4000-8000-000000000001','ADMIN',null);insert into transaction_deletion_jobs values('00000000-0000-4000-8000-000000000002','PENDING_STORAGE',null),('00000000-0000-4000-8000-000000000003','COMPLETE',null);`);
 await db.exec(await readFile(new URL('../migrations/2026_10_27_transaction_cleanup_retry.sql',import.meta.url),'utf8'));
 const claim=()=>db.query<any>('select * from claim_transaction_image_cleanup_v1()');assert.equal((await claim()).rows.length,1);assert.equal((await claim()).rows.length,0);
 await db.exec(`update transaction_deletion_jobs set cleanup_lease_until=now()-interval '1 second' where state='PENDING_STORAGE'`);assert.equal((await claim()).rows.length,1);
 await assert.rejects(db.exec(`set role authenticated;select * from public.claim_transaction_image_cleanup_v1();`),/permission denied/);await db.exec('reset role');
 await assert.rejects(db.query('select * from claim_transaction_image_cleanup_v1($1,$2)',['00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000099']),/authorization/);
 }finally{await db.close();}
});
