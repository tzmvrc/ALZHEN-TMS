import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalPhases,milestoneTone,operationalProgress} from '../src/services/operational-timeline.ts';
import {eventsWithPodReviews,orderedPodCargo} from '../src/services/pod-submissions.ts';
import {submissionReviewStatus} from '../src/services/pod-review-state.ts';
import type {TripReceipt} from '../src/services/receipt.service.ts';
import type {DeliveryCargo} from '../src/services/delivery.service.ts';
const trip='trip',assignment='truck',stop='stop';
const event=(id:string,status:'PENDING'|'APPROVED'|'REJECTED',hour:number)=>({id,trip_id:trip,assignment_id:assignment,trip_stop_id:stop,event_type:'POD_SUBMITTED',event_time:`2026-10-28T${hour}:00:00Z`,attachments:[{id:'page-'+id,file_name:'pod.png',kind:'receipt',pod_review_status:status,pod_review_version:status==='PENDING'?0:1}]});
const receipt=(id:string,status:'PENDING'|'APPROVED'|'REJECTED',model='MODEL-A')=>({id:'page-'+id,delivery_event_id:id,trip_id:trip,assignment_id:assignment,trip_stop_id:stop,pod_review_status:status,pod_review_version:status==='PENDING'?0:1,dr_number:'DR-A',ocr_text:`DR Number: DR-A\nModel Codes: ${model}\n--- Scanned text ---\nSynthetic`,uploaded_at:'2026-10-28T00:00:00Z'} as TripReceipt);
test('an approved document stays approved when another required DR makes the stop-wide flag false',()=>{
 const phases=operationalPhases({events:[event('original','APPROVED',10),event('rejected','REJECTED',11),event('replacement','PENDING',12)],assignmentId:assignment,trip:{id:trip} as any,data:{stops:[{id:stop,name:'Store',sequence:1}]} as any,operations:null,origin:'Warehouse',podStates:[{assignment_id:assignment,trip_stop_id:stop,pod_approved:false,pod_status:'RECEIVED'}]});
 const phase=phases.find(p=>p.key===stop)!;const pods=phase.milestones.filter(m=>m.type==='POD_SUBMITTED');
 assert.deepEqual(pods.map(m=>m.podStatus),['POD Approved','POD Rejected','POD Pending']);
 assert.deepEqual(pods.map(milestoneTone),['green','red','amber']);
 assert.equal(phase.milestones.find(m=>m.type==='STOP_DEPARTURE')?.completionApproved,false);
 assert.equal(operationalProgress(phase).complete,false);
});
test('confirmed receipt responses replace stale event metadata without borrowing another truck/stop decision',()=>{
 const old=event('original','PENDING',10),updated=eventsWithPodReviews([old],[receipt('original','APPROVED')]);
 assert.equal(submissionReviewStatus(updated[0].attachments??[]),'APPROVED');
 assert.equal(submissionReviewStatus(eventsWithPodReviews([old],[{...receipt('original','APPROVED'),assignment_id:'other'}])[0].attachments??[]),'PENDING');
 assert.equal(submissionReviewStatus(eventsWithPodReviews([event('original','APPROVED',10)],[receipt('original','PENDING')])[0].attachments??[]),'APPROVED');
 assert.equal(submissionReviewStatus([{id:'one',kind:'receipt',pod_review_status:'APPROVED'},{id:'two',kind:'receipt',pod_review_status:'PENDING'}]),'PENDING');
 assert.equal(submissionReviewStatus([]),null);
});
test('approved cargo partitions stably and preserves every operational value',()=>{
 const cargo=(id:string,model:string):DeliveryCargo=>({id,quantity:20,delivered:3,remaining:17,allocated_cbm:2.5,line:{id,customer_model:model,dr_number:'DR-A',trip_stop_id:stop}});
 const rows=[cargo('1','NONE'),cargo('2','MODEL-B'),cargo('3','MODEL-A'),cargo('4','MODEL-C')],before=JSON.stringify(rows);
 const pods=[receipt('a','APPROVED','MODEL-A'),receipt('b','APPROVED','MODEL-B'),receipt('c','REJECTED','MODEL-C')];
 assert.deepEqual(orderedPodCargo(rows,pods,assignment).map(row=>row.cargo.id),['2','3','1','4']);
 assert.equal(JSON.stringify(rows),before);
});
