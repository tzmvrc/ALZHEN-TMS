import test from 'node:test';
import assert from 'node:assert/strict';
import {truckerCargoRows} from '../src/services/trucker-cargo-list.ts';
import {composeSaved} from '../src/services/receipt-fields.service.ts';

test('stable delivered-first order is scoped to exact allocations, assignment and stop',()=>{
 const cargo=['a','b','c','d','e','f'].map(id=>({id,quantity:5,remaining:0,delivered:5,line:{id:'line-'+id,trip_stop_id:id==='f'?'other':'stop',dr_number:'DR',customer_model:'REPEATED'}}));
 const receipt=(id:string,status:string)=>({id:'pod-'+id,trip_id:'trip',assignment_id:'truck',trip_stop_id:id==='f'?'other':'stop',dr_number:'DR',pod_review_status:status,uploaded_at:'2026-10-30',ocr_text:composeSaved({fields:{dr:'DR',receiver:'Store',date:'2026-10-30',models:'REPEATED'},raw:'',productSelections:[{allocation_id:id,line_item_id:'line-'+id,assignment_id:'truck',trip_stop_id:id==='f'?'other':'stop',dr_number:'DR',model:'REPEATED',quantity:5}]})});
 const workspace={assignment:{id:'truck',trip_id:'trip'},cargo,stops:[{id:'stop',dr_number:'DR'},{id:'other',dr_number:'DR'}],milestones:[{event_type:'STOP_DEPARTURE',trip_stop_id:'stop',assignment_id:'truck'}]} as any;
 const pods=[receipt('b','APPROVED'),receipt('c','PENDING'),receipt('d','REJECTED'),receipt('e','APPROVED'),receipt('f','APPROVED')] as any;
 let rows=truckerCargoRows(workspace,pods,'stop');
 assert.deepEqual(rows.map(r=>r.cargo.id),['b','e','a','c','d']);
 assert.deepEqual(rows.filter(r=>r.state.delivered).map(r=>r.cargo.id),['b','e']);
 assert.match(rows.find(r=>r.cargo.id==='c')!.state.label,/POD Pending/);
 assert.match(rows.find(r=>r.cargo.id==='d')!.state.label,/POD Rejected/);
 assert.equal(truckerCargoRows(workspace,pods,'other')[0].state.delivered,false);
 rows=truckerCargoRows({...workspace,milestones:[]},pods,'stop');assert.equal(rows.some(r=>r.state.delivered),false);
 rows=truckerCargoRows(workspace,pods.map((p:any)=>({...p,assignment_id:'foreign'})),'stop');assert.equal(rows.some(r=>r.state.delivered),false);
 pods[1].pod_review_status='APPROVED';assert.deepEqual(truckerCargoRows(workspace,pods,'stop').map(r=>r.cargo.id),['b','c','e','a','d']);
 assert.deepEqual(workspace.cargo.map((r:any)=>r.id),['a','b','c','d','e','f']);
});
