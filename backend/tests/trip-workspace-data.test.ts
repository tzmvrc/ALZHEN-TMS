import test from 'node:test';
import assert from 'node:assert/strict';
import {assignmentWorkspace,tripDone,tripText,type Convoy} from '../../frontend/src/services/trip-workspace-data.ts';
import type {RoadTrip} from '../../frontend/src/services/road-routing.ts';
const a={id:'a',trip_id:'trip',stop_scope:'SELECTED'},b={id:'b',trip_id:'trip',stop_scope:'SELECTED'};
const convoy:Convoy={assignments:[a,b],stops:[{id:'s1',stop_sequence:1,delivery_status:'COMPLETED',arrival_time:'2026-10-24T01:00:00Z'},{id:'s2',stop_sequence:2,delivery_status:'PENDING'}],cargo:[{id:'item1',trip_stop_id:'s1',customer_model:'Appliance',quantity:10,cbm:5},{id:'item2',trip_stop_id:'s2',customer_model:'Cartons',quantity:2,cbm:1}],allocations:[{id:'aa1',assignment_id:'a',trip_line_item_id:'item1',quantity:6,allocated_cbm:3},{id:'ba1',assignment_id:'b',trip_line_item_id:'item1',quantity:4,allocated_cbm:2},{id:'aa2',assignment_id:'a',trip_line_item_id:'item2',quantity:2,allocated_cbm:1}],responsibilities:[{assignment_id:'a',trip_stop_id:'s1',progress:'COMPLETED'},{assignment_id:'a',trip_stop_id:'s2',progress:'PENDING'},{assignment_id:'b',trip_stop_id:'s1',progress:'IN_PROGRESS'}]};
test('truck selection scopes shared stops, cargo quantities and progress to the physical assignment',()=>{
 const first=assignmentWorkspace(a,convoy,[],undefined,[]),second=assignmentWorkspace(b,convoy,[],undefined,[]);
 assert.deepEqual(first.stops.map(s=>s.id),['s1','s2']);assert.deepEqual(second.stops.map(s=>s.id),['s1']);
 assert.equal(first.quantity,8);assert.equal(first.cbm,4);assert.equal(second.quantity,4);assert.equal(second.cbm,2);
 assert.equal(first.completed,1);assert.equal(second.completed,0);assert.equal(second.stops[0].status,'IN_PROGRESS');assert.equal(second.stops[0].shared,true);assert.equal(second.stops[0].progressScope,'Truck progress');assert.equal(second.stops[0].arrival_time,'2026-10-24T01:00:00Z');
});
test('missing assignments, pending convoy data and unrelated routes cannot leak another truck cargo or labels',()=>{
 assert.deepEqual(assignmentWorkspace(undefined,null,convoy.stops,undefined,[]).stops,[]);
 assert.deepEqual(assignmentWorkspace(b,null,convoy.stops,undefined,[]).cargo,[]);
 const wrong={assignmentId:'b',tripId:'other-trip',stops:[{id:'s1',name:'Wrong destination'}]} as unknown as RoadTrip;
 const result=assignmentWorkspace(b,convoy,[],wrong,[{trip_stop_id:'s1',store_name:'Saved store'}]);assert.equal(result.stops[0].name,'Saved store');
});
test('legacy all-stop scope labels shared progress as trip-level and does not invent allocation totals',()=>{
 const legacy={...a,stop_scope:'ALL'},data={...convoy,assignments:[legacy,b],responsibilities:convoy.responsibilities.filter(r=>r.assignment_id!=='a'),allocations:[]};
 const result=assignmentWorkspace(legacy,data,[],undefined,[]);assert.equal(result.stops.length,2);assert.equal(result.stops[0].progressScope,'Trip stop status');assert.equal(result.progressKnown,false);assert.equal(result.cbm,0);
 assert.equal(tripDone('NOT_DELIVERED'),false);assert.equal(tripDone('CANCELLED'),false);assert.equal(tripDone('COMPLETED'),true);assert.equal(tripText(0), '0');assert.equal(tripText(null,'Not recorded'),'Not recorded');
});
