import test from 'node:test';
import assert from 'node:assert/strict';
import {currentGalleryImages} from '../src/services/trip-gallery-eligibility.js';
test('only terminal approved submissions survive; independent same-DR documents and all pages remain distinct',()=>{
 const row=(id:string,event:string,status:string,replaces?:string)=>({id,trip_id:'trip',assignment_id:'truck',trip_stop_id:'stop',dr_number:'SAME-DR',kind:'receipt',delivery_event_id:event,pod_review_status:status,replaces_receipt_id:replaces,storage_path:id+'.jpg',created_at:'2026-10-30T01:00:00Z'});
 const rows=[row('old','attempt-1','APPROVED'),row('new-1','attempt-2','APPROVED','old'),row('new-2','attempt-2','APPROVED','old'),row('independent','other-receipt','APPROVED'),row('pending','pending','PENDING'),row('rejected','rejected','REJECTED'),row('old-2','attempt-3','APPROVED'),row('pending-replacement','attempt-4','PENDING','old-2'),{...row('photo','operational','REJECTED'),kind:'photo'},row('mixed-1','mixed','APPROVED'),row('mixed-2','mixed','REJECTED'),{...row('foreign','foreign','APPROVED'),trip_id:'other'}];
 const eligible=currentGalleryImages(rows,'trip');assert.deepEqual(eligible.map(row=>row.id).sort(),['independent','new-1','new-2','photo']);
 assert.equal(rows.find(row=>row.id==='old')!.pod_review_status,'APPROVED','Historical approvals were not changed');
 assert.equal(rows.length,12,'No historical records removed');
});
test('scope isolation, cycles, duplicate object references and duplicate query rows fail safely',()=>{
 const old={id:'old',trip_id:'trip',assignment_id:'truck',trip_stop_id:'stop',kind:'receipt',delivery_event_id:'first',pod_review_status:'APPROVED',storage_path:'old.jpg'};
 const cross={...old,id:'cross',assignment_id:'other-truck',delivery_event_id:'cross',replaces_receipt_id:'old',storage_path:'cross.jpg'};
 const cycleA={...old,id:'cycle-a',delivery_event_id:'cycle-a',replaces_receipt_id:'cycle-b',storage_path:'cycle-a.jpg'},cycleB={...old,id:'cycle-b',delivery_event_id:'cycle-b',replaces_receipt_id:'cycle-a',storage_path:'cycle-b.jpg'};
 const duplicate={...old,id:'duplicate',delivery_event_id:'duplicate'};
 assert.deepEqual(currentGalleryImages([old,old,cross,cycleA,cycleB,duplicate,{...old,id:'outbox-draft',kind:'photo',delivery_event_id:null,delivery_upload_state:'READY',delivery_upload_key:'draft-key',storage_path:'draft.jpg'}],'trip').map(row=>row.storage_path),['old.jpg']);
});
