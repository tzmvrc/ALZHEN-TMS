import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDeliveryAction,withConfirmedDeliveryEvent,currentDeliveryMilestone,type DeliveryWorkspace} from '../src/services/delivery.service.ts';
import {cargoDeliveryState,productDeliveryHistory} from '../src/services/cargo-delivery.ts';
const t=(h:number)=>`2026-10-29T${String(h).padStart(2,'0')}:00:00Z`;
const event=(type:string,stop:string|null,h=5)=>({id:`${type}:${stop}`,event_type:type,trip_stop_id:stop,event_time:t(h),verification_method:'RECORDED'});
const allocation=(id='allocation',dr='DR-A',stop='s1')=>({id,created_at:t(0),quantity:2,delivered:2,remaining:0,allocated_cbm:3,line:{id:`line:${id}`,trip_stop_id:stop,dr_number:dr,customer_model:'REPEATED'}});
const workspace=()=>({assignment:{id:'truck',trip_id:'trip'},stops:[{id:'s3',stop_sequence:3},{id:'s1',stop_sequence:1},{id:'s2',stop_sequence:2}],cargo:[allocation(),allocation('other','DR-B','s2')],milestones:[...['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'].map(type=>event(type,null)),event('STOP_DEPARTURE','s1')]} as unknown as DeliveryWorkspace);
const receipt=(status='APPROVED',id='receipt',allocationId='allocation',dr='DR-A',stop='s1')=>({id,trip_id:'trip',assignment_id:'truck',trip_stop_id:stop,dr_number:dr,delivery_event_id:`pod:${id}`,uploaded_at:t(7),pod_reviewed_at:t(10),pod_review_status:status,pod_reviewer_name:'Admin Fixture',ocr_text:`DR Number: ${dr}\nModel Codes: REPEATED\nProduct Selections: ${JSON.stringify([{allocation_id:allocationId,line_item_id:`line:${allocationId}`,assignment_id:'truck',trip_stop_id:stop,dr_number:dr,model:'REPEATED',quantity:2}])}\n--- Scanned text ---\nFixture`} as any);
test('next destination uses sequence and explicit travel, including immediate server acknowledgement',()=>{
 const w=workspace();const next=nextDeliveryAction(w,'s3');assert.equal(next?.type,'IN_TRANSIT');assert.equal(next?.stop_id,'s2');
 const saved={...event('IN_TRANSIT','s2',6),trip_id:'trip',assignment_id:'truck',delivery_metadata:{}} as any;
 const updated=withConfirmedDeliveryEvent(w,saved);assert.equal(nextDeliveryAction(updated,'s2')?.type,'ARRIVED');assert.equal(currentDeliveryMilestone(updated)?.event_type,'IN_TRANSIT');assert.equal(w.milestones.some(m=>m.event_type==='IN_TRANSIT'),false);
 w.milestones.push(event('STOP_DEPARTURE','s2'),event('STOP_DEPARTURE','s3'));assert.equal(nextDeliveryAction(w,null),null);
});
test('legacy arrival is not reset and unresolved replacement retains priority',()=>{
 const w=workspace();w.milestones.push(event('ARRIVED','s2'));assert.equal(nextDeliveryAction(w,'s2')?.type,'POD_SUBMITTED');
 w.milestones.push({...event('POD_SUBMITTED','s1'),delivery_metadata:{pod_replacement_request:{receipt_id:'old',reason:'Fix photo',requested_at:t(6),resolved_by:null}}});assert.equal(nextDeliveryAction(w,'s2')?.replaces_receipt_id,'old');
});
test('Delivered requires physical completion, actual unloaded quantity and a linked approved POD',()=>{
 const w=workspace(),c=w.cargo[0];assert.equal(cargoDeliveryState(c,receipt(),w).label,'Delivered');
 assert.equal(cargoDeliveryState(c,receipt('PENDING'),w).label,'Delivered — POD Pending');assert.equal(cargoDeliveryState(c,receipt('REJECTED'),w).label,'Delivered — POD Rejected');
 w.milestones=w.milestones.filter(e=>e.event_type!=='STOP_DEPARTURE');const early=cargoDeliveryState({...c,delivered:0,remaining:2},receipt(),w);assert.equal(early.label,'On Truck');assert.equal(early.delivered,false);assert.equal(early.review,'APPROVED');
 w.milestones.push(event('UNLOADING_STARTED','s1'));assert.equal(cargoDeliveryState(c,receipt(),w).label,'Unloading');
});
test('product history scopes explicit allocation identities, photos and chronological reviews across replacements',()=>{
 const w=workspace(),c=w.cargo[0],old=receipt('REJECTED','old'),replacement={...receipt('PENDING','new'),uploaded_at:t(12),pod_reviewed_at:null,replaces_receipt_id:'old'},foreign={...receipt('APPROVED','private'),assignment_id:'other-truck'},otherDr=receipt('APPROVED','other-dr','other','DR-B','s2');
 const rows=[{...event('POD_SUBMITTED','s1',7),id:'pod:old',trip_id:'trip',assignment_id:'truck'},{...event('POD_REJECTED','s1',10),id:'review:old',trip_id:'trip',assignment_id:'truck',notes:'Missing signature',delivery_metadata:{pod_review_event_id:'audit',receipt_id:'old'}},{...event('POD_SUBMITTED','s1',12),id:'pod:new',trip_id:'trip',assignment_id:'truck',delivery_metadata:{replaces_receipt_id:'old'}}];
 const history=productDeliveryHistory(c,w,[old,replacement,foreign,otherDr],rows);
 assert.deepEqual(history.flatMap(e=>e.photos.map(p=>p.id)),['old','new']);assert.equal(history.filter(e=>e.kind==='review').length,1);assert.equal(history.find(e=>e.kind==='review')?.reason,'Missing signature');assert.equal(history.at(-1)?.title,'Replacement POD Submitted');assert.ok(history.some(e=>e.title==='Assigned to Truck'));assert.ok(history.some(e=>e.title==='Delivery completed'));assert.equal(history.some(e=>e.title==='On the Way'),false);
 assert.equal(JSON.stringify(history).includes('private'),false);assert.equal(JSON.stringify(history).includes('other-dr'),false);
});
