import test from 'node:test';import assert from 'node:assert/strict';
import {podUploadCargo} from '../src/services/pod-cargo-selection.ts';
import {composeSaved} from '../src/services/receipt-fields.service.ts';
import {submittedPodProducts} from '../src/services/pod-submissions.ts';
test('stop defaults use allocation IDs and uncovered quantities across DRs, independent of unloading',()=>{
 const cargo=['a','b','c','other'].map((id,i)=>({id,quantity:[5,7,7,9][i],remaining:0,delivered:[5,7,7,9][i],line:{id:'line-'+id,trip_stop_id:id==='other'?'elsewhere':'stop',dr_number:i?'DR2':'DR1',customer_model:'REPEATED'}}));
 const workspace={assignment:{id:'truck',trip_id:'trip'},cargo,stops:[{id:'stop',dr_number:'DR1'},{id:'elsewhere',dr_number:'DR2'}],pod_cargo_reviews:[]} as any;
 let catalog=podUploadCargo(workspace,'stop');assert.deepEqual(catalog.options,['a','b','c']);assert.deepEqual(catalog.quantities,{a:'5',b:'7',c:'7'});
 const receipt=(id:string,quantity:number,status:string,event:string)=>({id:event,delivery_event_id:event,trip_id:'trip',assignment_id:'truck',trip_stop_id:'stop',dr_number:'DR1',pod_review_status:status,ocr_text:composeSaved({fields:{dr:'DR1',receiver:'Store',date:'2026-10-30',models:'REPEATED'},raw:'OCR DIFFERENT',productSelections:[{allocation_id:id,line_item_id:'line-'+id,assignment_id:'truck',trip_stop_id:'stop',model:'REPEATED',dr_number:id==='a'?'DR1':'DR2',quantity}]})});
 workspace.pod_cargo_reviews=[receipt('a',2,'PENDING','one'),receipt('b',7,'REJECTED','rejected'),receipt('c',7,'APPROVED','approved')];
 catalog=podUploadCargo(workspace,'stop');assert.deepEqual(catalog.options,['a','b']);assert.deepEqual(catalog.quantities,{a:'3',b:'7'});
 workspace.pod_cargo_reviews.push({...workspace.pod_cargo_reviews[0],id:'second-image'});assert.equal(podUploadCargo(workspace,'stop').quantities.a,'3','same submission pages count once');
 const saved=receipt('b',4,'PENDING','replacement');assert.deepEqual(submittedPodProducts(saved as any,cargo as any).map(row=>[row.allocationId,row.dr,row.quantity]),[['b','DR2',4]]);
 workspace.pod_cargo_reviews.push({...receipt('b',7,'PENDING','foreign'),assignment_id:'foreign'});assert.equal(podUploadCargo(workspace,'stop').quantities.b,'7');
 assert.deepEqual(podUploadCargo(workspace,'unauthorized').options,[]);
});
