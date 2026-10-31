import test from 'node:test';import assert from 'node:assert/strict';
import {cargoPodReceipt,submittedPodProducts} from '../src/services/pod-submissions.ts';import {cargoDeliveryState} from '../src/services/cargo-delivery.ts';import {composeSaved} from '../src/services/receipt-fields.service.ts';import {convoyMilestone} from '../src/services/convoy-event-details.ts';
test('explicit allocations cover multiple DRs while isolating other cargo, stops and assignments',()=>{
 const cargo=['A','B','C'].map((dr,i)=>({id:'a'+i,quantity:10,remaining:0,delivered:10,line:{id:'l'+i,trip_stop_id:'s',dr_number:dr,customer_model:'REPEATED'}})) as any[];
 const selections=cargo.slice(0,2).map((c,i)=>({allocation_id:c.id,line_item_id:c.line.id,assignment_id:'truck',trip_stop_id:'s',dr_number:c.line.dr_number,model:'REPEATED',quantity:i+2}));
 const pod={id:'pod',assignment_id:'truck',trip_id:'trip',trip_stop_id:'s',dr_number:'A',uploaded_at:'2026-10-30T01:00:00Z',pod_review_status:'APPROVED',ocr_text:composeSaved({fields:{dr:'A',receiver:'Manual store',date:'2026-10-30',models:'REPEATED'},raw:'OCR DR DIFFERENT',productSelections:selections})} as any;
 assert.equal(cargoPodReceipt(cargo[1],[pod],'truck')?.id,'pod');assert.equal(cargoPodReceipt(cargo[2],[pod],'truck'),undefined);assert.equal(cargoPodReceipt(cargo[1],[{...pod,assignment_id:'foreign'}],'truck'),undefined);assert.deepEqual(submittedPodProducts(pod,cargo).map(p=>p.quantity),[2,3]);
 const w={assignment:{id:'truck'},milestones:[{event_type:'STOP_DEPARTURE',trip_stop_id:'s',assignment_id:'truck'}]} as any;
 assert.equal(cargoDeliveryState(cargo[1],cargoPodReceipt(cargo[1],[pod],'truck'),w).label,'Delivered');assert.equal(cargoDeliveryState({...cargo[1],remaining:10,delivered:0},pod,w).delivered,false);
});
test('convoy uses persisted stop/assignment identity and never copies selected truck data into a missing event',()=>{
 const selected={key:'s:ARRIVED',title:'Arrived',type:'ARRIVED',stopId:'s',time:'2026-10-30T01:00:00Z',scope:'assignment',files:[],event:{assignment_id:'one'}} as any;
 const other={...selected,key:'other',time:'2026-10-30T02:00:00Z',event:{assignment_id:'two'}};
 assert.equal(convoyMilestone(selected,[selected,other],'two',[{id:'s'}] as any,[]).time,other.time);
 const pending=convoyMilestone(selected,[selected],'two',[{id:'s'}] as any,[]);assert.equal(pending.pending,true);assert.equal(pending.event,undefined);assert.equal(pending.time,null);assert.deepEqual(pending.files,[]);
 const stops=[{id:'s',store_id:'store',dr_number:'A',stop_sequence:1},{id:'t',store_id:'different',dr_number:'A',stop_sequence:1}] as any;
 assert.equal(convoyMilestone(selected,[{...other,stopId:'t'}],'two',[stops[1]],stops).pending,true);
});
