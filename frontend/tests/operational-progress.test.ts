import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedOperationalProgress as progress} from '../src/services/operational-progress.ts';
const a=[{id:'a',trip_id:'trip',stop_scope:'ALL'},{id:'b',trip_id:'trip',stop_scope:'SELECTED'}] as any;
const s=[{id:'one'},{id:'two'}] as any;
const r=[{assignment_id:'b',trip_stop_id:'two',progress:'PENDING'}];
const event=(assignment_id:string,event_type:string,trip_stop_id:string|null=null)=>({id:Math.random().toString(),assignment_id,event_type,trip_stop_id,event_time:'2026-10-27T12:00:00Z'}) as any;
test('progress weights applicable confirmed milestones across assignments and stops, never custom or transit events',()=>{
 assert.equal(progress(a,s,[],r).percent,0);const events=['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'].map(t=>event('a',t));
 assert.deepEqual(progress(a,s,events,r),{done:4,total:25,percent:16});
 const withUpdates=[...events,event('a','IN_TRANSIT','one'),event('a','CUSTOM_STATUS','one'),event('b','CUSTOM_STATUS','two')];assert.deepEqual(progress(a,s,withUpdates,r),progress(a,s,events,r));
 assert.equal(progress(a,s,events,r,[],'b').done,0);
 for(const stop of ['one','two'])for(const type of ['ARRIVED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE'])events.push(event('a',type,stop));
 events.push(event('a','ASSIGNMENT_COMPLETED'));assert.ok(progress(a,s,events,r,[],'a').percent<100);
 const pods=['one','two'].map(trip_stop_id=>({assignment_id:'a',trip_stop_id,approved:true}));assert.equal(progress(a,s,events,r,pods,'a').percent,100);assert.ok(progress(a,s,events,r,pods).percent<100);
 events.push(...['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ASSIGNMENT_COMPLETED'].map(t=>event('b',t)));for(const type of ['ARRIVED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE'])events.push(event('b',type,'two'));
 assert.equal(progress(a,s,events,r,[...pods,{assignment_id:'b',trip_stop_id:'two',approved:true}]).percent,100);
});

test('unassigned required destinations retain pending units while empty optional trucks add none',()=>{assert.deepEqual(progress([{id:'empty',stop_scope:'SELECTED'}] as any,[{id:'unassigned'}] as any,[]),{done:0,total:5,percent:0});});

test('Workspace and card projections use identical weighted confirmed state, preserving unassigned stops',async()=>{
 const {confirmedStateProgress}=await import('../src/services/operational-progress');
 const a={assignment_id:'a',trip_stop_id:'one',pod_approved:false,warehouse_arrival_at:'2026-10-27T01:00:00Z',loading_start_at:'2026-10-27T02:00:00Z',loading_finished_at:'2026-10-27T03:00:00Z',warehouse_departure_time:'2026-10-27T04:00:00Z'};
 const b={assignment_id:'b',trip_stop_id:'one',pod_approved:false};const states=[a,{...a,trip_stop_id:'two'},b];assert.deepEqual(confirmedStateProgress(states),{done:4,total:25,percent:16});assert.equal(confirmedStateProgress([...states,...states]).percent,16);assert.equal(confirmedStateProgress(states,1).total,30);
 assert.equal(confirmedStateProgress(states.filter(s=>s.assignment_id==='b')).percent,0);
 const complete={...a,arrival_time:'2026-10-27T05:00:00Z',start_unloading_time:'2026-10-27T06:00:00Z',finish_unloading_time:'2026-10-27T07:00:00Z',departure_time:'2026-10-27T08:00:00Z',pod_approved:true,assignment_completed:true};assert.equal(confirmedStateProgress([complete]).percent,100);assert.equal(confirmedStateProgress([{...complete,pod_approved:false}]).percent,90);
});
