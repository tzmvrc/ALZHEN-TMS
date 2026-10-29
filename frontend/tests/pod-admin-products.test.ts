import test from 'node:test';
import assert from 'node:assert/strict';
import {adminPodProducts} from '../src/services/pod-admin-products.ts';
import {podReviewThreads} from '../src/services/pod-submissions.ts';
import {composeSaved,snapshotOf,type PodProductSelection} from '../src/services/receipt-fields.service.ts';
import type {DeliveryCargo} from '../src/services/delivery.service.ts';
import type {TripReceipt} from '../src/services/receipt.service.ts';
const cargo:DeliveryCargo[]=[['a','line-a','stop','DR-A'],['b','line-b','stop','DR-A'],['c','line-c','other-stop','DR-B']].map(([id,line,stop,dr])=>({id,quantity:20,allocated_cbm:2,delivered:1,remaining:19,line:{id:line,trip_stop_id:stop,dr_number:dr,customer_model:'SAME-MODEL'}}));
const receipt={id:'original',trip_id:'trip',assignment_id:'truck',trip_stop_id:'stop',dr_number:'DR-A',uploaded_at:'2026-10-29T00:00:00Z',pod_review_status:'REJECTED',ocr_version:0} as TripReceipt;
const selection:PodProductSelection={allocation_id:'b',line_item_id:'line-b',assignment_id:'truck',trip_stop_id:'stop',dr_number:'DR-A',model:'SAME-MODEL',quantity:3};
test('repeated models preselect only the submitted allocation and never assigned quantities',()=>{
 const snapshot=snapshotOf(composeSaved({raw:'',fields:{dr:'DR-A',models:'SAME-MODEL',receiver:'Store',date:''},productSelections:[selection]}),'DR-A');
 const before=structuredClone(cargo),review=adminPodProducts(receipt,snapshot,cargo);
 assert.deepEqual(review.selections.map(item=>[item.allocation_id,item.quantity]),[['b',3]]);
 assert.deepEqual(review.options.map(item=>item.id),['a','b']);assert.deepEqual(cargo,before);
 snapshot.productSelections=[{...selection,quantity:4}];assert.equal(adminPodProducts(receipt,snapshot,cargo).selections[0].quantity,4);
});
test('cross-truck, cross-stop, wrong DR and wrong line identities are flagged instead of matched by model',()=>{
 const work=snapshotOf('', 'DR-A');work.productSelections=[{...selection,assignment_id:'other-truck'},{...selection,trip_stop_id:'other-stop'},{...selection,dr_number:'DR-B'},{...selection,line_item_id:'line-a'}];
 const review=adminPodProducts(receipt,work,cargo);assert.equal(review.selections.length,0);assert.equal(review.mismatches.length,4);
});
test('legacy ambiguous models never preselect all same-name allocations or invent quantities',()=>{
 const work=snapshotOf('Model Codes: SAME-MODEL\n--- Scanned text ---\n','DR-A');assert.equal(adminPodProducts(receipt,work,cargo).selections.length,0);
});
test('replacement history retains rejected originals, latest Pending, and independent same-DR submissions',()=>{
 const pending={...receipt,id:'replacement',replaces_receipt_id:'original',pod_review_status:'PENDING',uploaded_at:'2026-10-29T01:00:00Z'} as TripReceipt;
 const independent={...receipt,id:'independent',pod_review_status:'APPROVED'} as TripReceipt;
 const foreign={...pending,id:'foreign',assignment_id:'other-truck'};
 const threads=podReviewThreads([pending,independent,receipt,foreign]);
 assert.equal(threads.length,3);const chain=threads.find(attempts=>attempts.length===2)!;
 assert.deepEqual(chain.map(group=>group[0].pod_review_status),['REJECTED','PENDING']);assert.equal(chain[1][0].id,'replacement');assert.equal(receipt.pod_review_status,'REJECTED');
});
