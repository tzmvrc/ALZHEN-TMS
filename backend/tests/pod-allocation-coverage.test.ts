import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('atomic POD coverage counts each submission once, permits partial/rejected replacements and preserves quantities',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create table trips(id uuid);create table products(id uuid,model_code text);create table trip_stops(id uuid,dr_number text);create table trip_line_items(id uuid,trip_id uuid,trip_stop_id uuid,product_id uuid,dr_number text,customer_model text);create table trip_cargo_allocations(id uuid,trip_id uuid,assignment_id uuid,trip_line_item_id uuid,quantity numeric);create table trip_images(id uuid primary key,trip_id uuid,assignment_id uuid,trip_stop_id uuid,kind text,dr_number text,ocr_text text,delivery_event_id uuid,pod_review_status text default 'PENDING',delivery_upload_state text default 'READY',display_order int default 0);insert into trips values('${id(3)}');insert into trip_stops values('${id(1)}','A');insert into trip_line_items values('${id(2)}','${id(3)}','${id(1)}',null,'B','MODEL');insert into trip_cargo_allocations values('${id(4)}','${id(3)}','${id(5)}','${id(2)}',10);`);
 for(const file of ['2026_11_23_pod_allocation_scope.sql','2026_11_25_pod_allocation_coverage.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const save=(image:number,event:number,qty:number,status='PENDING')=>db.query(`insert into trip_images(id,trip_id,assignment_id,trip_stop_id,kind,ocr_text,delivery_event_id,pod_review_status) values($1,$2,$3,$4,'receipt',$5,$6,$7)`,[id(image),id(3),id(5),id(1),'DR No: A\nProduct Selections: '+JSON.stringify([{allocation_id:id(4),assignment_id:id(5),line_item_id:id(2),trip_stop_id:id(1),dr_number:'B',model:'MODEL',quantity:qty}])+'\n--- Scanned text ---\nOriginal OCR',id(event),status]);
 await save(10,20,6);await save(11,20,6);await assert.rejects(()=>save(12,21,5),/remaining POD coverage/);await save(12,21,4);
 await db.exec(`update trip_images set pod_review_status='REJECTED' where delivery_event_id='${id(20)}'`);await save(13,22,6);
 await assert.rejects(()=>save(14,23,1),/remaining POD coverage/);
 await db.exec(`update trip_images set ocr_text=replace(ocr_text,'DR No: A','DR No: corrected') where id='${id(13)}'`);
 assert.equal((await db.query<any>('select quantity from trip_cargo_allocations')).rows[0].quantity,'10');
 assert.equal((await db.query<any>('select count(*) from trip_images')).rows[0].count,4);
 }finally{await db.close();}
});
