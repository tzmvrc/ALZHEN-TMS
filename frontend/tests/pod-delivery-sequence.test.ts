import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDeliveryAction,withConfirmedDeliveryEvent,currentDeliveryMilestone,type DeliveryWorkspace} from '../src/services/delivery.service.ts';
import {operationalPhases,operationalProgress} from '../src/services/operational-timeline.ts';
const stamp=(hour:number)=>`2026-10-29T${String(hour).padStart(2,'0')}:00:00Z`;
const event=(type:string,hour:number)=>({id:type,event_type:type,event_time:stamp(hour),trip_stop_id:type.startsWith('WAREHOUSE')||type.startsWith('LOADING')||type==='ASSIGNMENT_COMPLETED'?null:'stop',verification_method:'RECORDED'});
const workspace=()=>({assignment:{id:'truck',trip_id:'trip'},stops:[{id:'stop',dr_number:'A'}],cargo:['A','B','C'].map((dr,index)=>({id:String(index),line:{trip_stop_id:'stop',dr_number:dr}})),pods:[{trip_stop_id:'stop',dr_number:'A',approved:false,pod_status:'PENDING_TRUCKER_CONFIRMATION',pod_submitted_at:stamp(5)}],milestones:['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ARRIVED','POD_SUBMITTED'].map((type,index)=>event(type,index))} as unknown as DeliveryWorkspace);
test('one backend-confirmed POD advances to unloading despite other DRs and pending approval',()=>{const w=workspace();assert.equal(nextDeliveryAction(w,'stop')?.type,'UNLOADING_STARTED');w.pods=[];assert.equal(nextDeliveryAction(w,'stop')?.type,'UNLOADING_STARTED');w.milestones=w.milestones.filter(e=>e.event_type!=='POD_SUBMITTED');assert.equal(nextDeliveryAction(w,'stop')?.type,'POD_SUBMITTED');});
test('late rejection interrupts at current progress and replacement never recreates completed milestones',()=>{
 for(const later of [[],['UNLOADING_STARTED','UNLOADING_FINISHED'],['UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED']]){
  const w=workspace();w.milestones.push(...later.map((type,index)=>event(type,index+7)));const pod=w.milestones.find(e=>e.event_type==='POD_SUBMITTED')!;pod.delivery_metadata={pod_replacement_request:{receipt_id:'receipt',reason:'Correct the photo',requested_at:stamp(12),resolved_by:null}};
  const before=structuredClone(w.milestones);assert.equal(nextDeliveryAction(w,'stop')?.replaces_receipt_id,'receipt');pod.delivery_metadata.pod_replacement_request!.resolved_by='replacement';w.milestones.push({...event('POD_SUBMITTED',13),id:'replacement'});
  assert.equal(nextDeliveryAction(w,'stop')?.type,later.includes('STOP_DEPARTURE')?undefined:later.includes('UNLOADING_FINISHED')?'STOP_DEPARTURE':'UNLOADING_STARTED');assert.deepEqual(w.milestones.filter(e=>later.includes(e.event_type)),before.filter(e=>later.includes(e.event_type)));if(later.length)assert.equal(currentDeliveryMilestone(w)?.event_type,later.at(-1));
 }
});
test('Admin timeline interleaves immutable review timestamps after unloading; required actions are not completed uploads',()=>{
 const w=workspace();w.milestones.push(event('UNLOADING_STARTED',7),event('UNLOADING_FINISHED',8),event('STOP_DEPARTURE',9));const pod=w.milestones.find(e=>e.event_type==='POD_SUBMITTED')!;pod.delivery_metadata={pod_replacement_request:{receipt_id:'receipt',reason:'Missing signature',requested_at:stamp(11),resolved_by:null}};
 const rows=w.milestones.map(e=>({...e,trip_id:'trip',assignment_id:'truck',delivery_metadata:e.delivery_metadata??{},attachments:[]}));rows.push({...event('POD_REJECTED',10),trip_id:'trip',assignment_id:'truck',delivery_metadata:{pod_review_event_id:'review',receipt_id:'receipt'},attachments:[]} as any);
 const input={events:rows,assignmentId:'truck',trip:{id:'trip'} as any,data:{stops:[{id:'stop',name:'Store',sequence:1}]} as any,operations:null,origin:'Warehouse'};
 const phase=operationalPhases(input).find(p=>p.key==='stop')!;
 assert.deepEqual(phase.milestones.filter(m=>m.time&&!m.derived).map(m=>m.type),['ARRIVED','POD_SUBMITTED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE','POD_REJECTED','POD_REPLACEMENT_REQUIRED']);assert.equal(operationalProgress(phase).complete,true);assert.equal(phase.milestones.at(-1)?.pending,true);
 pod.delivery_metadata.pod_replacement_request!.resolved_by='replacement';const replacement={...event('POD_SUBMITTED',12),id:'replacement',trip_id:'trip',assignment_id:'truck',delivery_metadata:{replaces_receipt_id:'receipt'},attachments:[]};
 const updated=operationalPhases({...input,events:[...rows.filter(e=>e.id!==pod.id),{...rows.find(e=>e.id===pod.id)!,delivery_metadata:pod.delivery_metadata},replacement]}).find(p=>p.key==='stop')!;
 assert.equal(updated.milestones.some(m=>m.type==='POD_REPLACEMENT_REQUIRED'),false);assert.equal(updated.milestones.at(-1)?.title,'POD Resubmitted');assert.equal(operationalProgress(updated).complete,true);
});

test('a server acknowledgement advances immediately and resolves only its replacement request',()=>{
 const w=workspace();w.milestones=w.milestones.filter(row=>row.event_type!=='POD_SUBMITTED');const confirmed={...event('POD_SUBMITTED',6),trip_id:'trip',assignment_id:'truck',delivery_metadata:{}} as any;
 assert.equal(nextDeliveryAction(withConfirmedDeliveryEvent(w,confirmed),'stop')?.type,'UNLOADING_STARTED');assert.equal(withConfirmedDeliveryEvent(w,{...confirmed,assignment_id:'other-truck'}),w);
 w.milestones.push({...event('POD_SUBMITTED',5),delivery_metadata:{pod_replacement_request:{receipt_id:'old',reason:'Correct photo',requested_at:stamp(7),resolved_by:null}}});
 const resolved=withConfirmedDeliveryEvent(w,{...confirmed,id:'replacement',delivery_metadata:{replaces_receipt_id:'old'}});assert.equal(nextDeliveryAction(resolved,'stop')?.type,'UNLOADING_STARTED');assert.equal(w.milestones.at(-1)?.delivery_metadata?.pod_replacement_request?.resolved_by,null);
});
