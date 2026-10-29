import test from 'node:test';
import assert from 'node:assert/strict';
import {podSubmissions,submittedPodProducts,cargoPodReceipt} from '../../frontend/src/services/pod-submissions.js';
import {composeSaved} from '../../frontend/src/services/receipt-fields.service.js';
import type {TripReceipt} from '../../frontend/src/services/receipt.service.js';
import type {DeliveryCargo} from '../../frontend/src/services/delivery.service.js';
const receipt=(id:string,event:string,stop='A',models='MODEL-A',quantities?:Record<string,number>):TripReceipt=>({id,delivery_event_id:event,assignment_id:'truck-A',trip_id:'trip',trip_stop_id:stop,dr_number:'SHARED-DR',file_name:null,signed_url:null,uploaded_at:'2026-10-28T00:00:00Z',ocr_text:composeSaved({fields:{dr:'SHARED-DR',receiver:'Store',models,date:''},raw:'MODEL-A and MODEL-B in raw OCR are not selections',modelQuantities:quantities}),ocr_confidence:null,ocr_version:0,reviewed_at:null,reviewed_by:null});
const cargo=(id:string,stop:string,model:string):DeliveryCargo=>({id,quantity:99,allocated_cbm:1,delivered:0,remaining:99,line:{id,trip_stop_id:stop,dr_number:'SHARED-DR',customer_model:model}});
test('pages group by submission identity while repeated DRs and legacy documents stay independent',()=>{
 const a=receipt('a','submission-1'),b=receipt('b','submission-1'),replacement=receipt('c','submission-2'),legacy={...receipt('d',''),delivery_event_id:null};
 assert.deepEqual(podSubmissions([a,b,replacement,legacy]).map(pages=>pages.map(p=>p.id)),[['a','b'],['c'],['d']]);
});
test('received quantities use explicit selections, retain zero and never infer assigned or unloaded quantities',()=>{
 const rows=[cargo('a','A','MODEL-A'),cargo('b','A','MODEL-B'),cargo('c','B','MODEL-C')];
 assert.deepEqual(submittedPodProducts(receipt('a','e','A','MODEL-A, MODEL-B, MODEL-C',{'MODEL-A':0,'MODEL-B':7,'MODEL-C':20}),rows),[{model:'MODEL-A',dr:'SHARED-DR',quantity:0},{model:'MODEL-B',dr:'SHARED-DR',quantity:7}]);
 assert.equal(submittedPodProducts(receipt('a','e','A','MODEL-A'),rows)[0].quantity,null);
 assert.deepEqual(submittedPodProducts(receipt('a','e','A',''),rows),[]);
 assert.equal(rows[0].quantity,99);assert.equal(rows[0].delivered,0);
});
test('cargo POD status is scoped to the exact truck, stop, DR and submitted model',()=>{
 const item=cargo('a','A','MODEL-A'),first={...receipt('first','e'),pod_review_status:'REJECTED' as const},otherTruck={...receipt('other','other'),assignment_id:'truck-B'},otherStop=receipt('stop','stop','B'),replacement={...receipt('replacement','replacement'),uploaded_at:'2026-10-28T01:00:00Z',pod_review_status:'PENDING' as const};
 assert.equal(cargoPodReceipt(item,[first,otherTruck,otherStop,replacement],'truck-A')?.id,'replacement');
 assert.equal(cargoPodReceipt(cargo('b','A','MODEL-B'),[first,replacement],'truck-A'),undefined);
 assert.equal(cargoPodReceipt(item,[otherTruck,otherStop],'truck-A'),undefined);
 assert.equal(cargoPodReceipt({...item,line:{...item.line,dr_number:'DIFFERENT'}},[first],'truck-A'),undefined);
 const stopDrItem={...item,line:{...item.line,dr_number:''}};
 assert.equal(cargoPodReceipt(stopDrItem,[first],'truck-A',{A:'SHARED-DR'})?.id,'first');
 assert.equal(cargoPodReceipt(stopDrItem,[first],'truck-A',{B:'SHARED-DR'}),undefined);
 assert.deepEqual(submittedPodProducts(receipt('a','e','A','MODEL-A',{'MODEL-A':3}),[stopDrItem],{A:'SHARED-DR'}),[{model:'MODEL-A',dr:'SHARED-DR',quantity:3}]);
});
