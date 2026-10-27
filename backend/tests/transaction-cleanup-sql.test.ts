import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('actual cleanup validator preserves shared/unrelated files, blocks replaced objects, and permits exclusive/idempotent cleanup',async()=>{
 const db=new PGlite();try{
 const actor='00000000-0000-4000-8000-000000000001',job='00000000-0000-4000-8000-000000000002',object='00000000-0000-4000-8000-000000000003',trip='00000000-0000-4000-8000-000000000004',other='00000000-0000-4000-8000-000000000005',path=`trips/${trip}/delivery/${actor}/${object}`;
 await db.exec(`create schema storage;create table public.profiles(id uuid,role text);create table public.transaction_deletion_jobs(id uuid,storage_objects jsonb);create table public.trip_images(trip_id uuid,storage_path text);create table public.report_receipts(storage_path text);create table public.driver_trip_updates(pod_image_path text,pod_image_url text);create table public.documents(file_path text);create table public.pod_drive_files(drive_link text);create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb,version text);`);
 await db.exec(await readFile(new URL('./fixtures/transaction-cleanup-validation.sql',import.meta.url),'utf8'));
 await db.query(`insert into public.profiles values($1,'ADMIN');`,[actor]);await db.query(`insert into storage.objects values($1,'trip-images',$2,'{"size":123}','version-1')`,[object,path]);
 await db.query(`insert into transaction_deletion_jobs values($1,jsonb_build_array(jsonb_build_object('bucket','trip-images','path',$2::text,'object_id',$3::text,'metadata_fingerprint',md5('{"size": 123}'),'object_version','version-1')))`,[job,path,object]);
 // A different trip's unrelated evidence must remain untouched and must not block exclusive files.
 await db.query('insert into trip_images values($1,$2)',[other,`trips/${other}/other.jpg`]);
 const validate=async()=>(await db.query<any>('select public.validate_transaction_cleanup_objects_v1($1,$2) files',[job,actor])).rows[0].files;
 assert.equal((await validate()).length,1);
 await db.query('insert into trip_images values($1,$2)',[other,path]);await assert.rejects(validate(),/referenced by retained data/);
 await db.query('delete from trip_images where storage_path=$1',[path]);await db.exec(`update storage.objects set version='replacement'`);await assert.rejects(validate(),/identity changed/);
 await db.exec('delete from storage.objects');assert.deepEqual(await validate(),[]);
 assert.equal((await db.query<any>('select count(*)::int n from trip_images where trip_id=$1',[other])).rows[0].n,1);
 }finally{await db.close();}
});
