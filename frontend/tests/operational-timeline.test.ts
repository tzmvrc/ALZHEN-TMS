import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalPhases,milestoneTone,isOperationalReport} from '../src/services/operational-timeline.ts';
const trip='00000000-0000-4000-8000-000000000001',assignment='00000000-0000-4000-8000-000000000002',stop='00000000-0000-4000-8000-000000000003';
const event=(id:string,type:string,hour:number,title?:string,scope=assignment)=>({id,trip_id:trip,assignment_id:scope,trip_stop_id:type.startsWith('WAREHOUSE')?null:stop,event_type:type,event_time:`2026-10-27T${hour.toString().padStart(2,'0')}:00:00Z`,delivery_metadata:title?{title}:{}});
const input=(events:any[],ops:any=null)=>({events,assignmentId:assignment,trip:{id:trip},origin:'Origin',data:{stops:[{id:stop,name:'Destination',sequence:1}]},operations:ops} as any);
test('saved traffic and breakdown appear in chronological order between transit and arrival, with stable deduplication and assignment scope',()=>{
 const traffic=event('traffic','CUSTOM_STATUS',12,'Traffic');
 const phases=operationalPhases(input([event('depart','WAREHOUSE_DEPARTURE',10),event('route','IN_TRANSIT',11),traffic,event('breakdown','CUSTOM_STATUS',13,'Vehicle breakdown'),event('arrive','ARRIVED',14),traffic,event('other','CUSTOM_STATUS',12,'Other driver','another-assignment')]));
 const delivery=phases.find(p=>p.key===stop)!;
 assert.deepEqual(delivery.milestones.filter(m=>m.time).map(m=>m.key),['route','traffic','breakdown','arrive']);
 assert.equal(milestoneTone(delivery.milestones.find(m=>m.key==='traffic')!),'amber');assert.equal(milestoneTone(delivery.milestones.find(m=>m.key==='breakdown')!),'red');
 assert.equal(phases.at(-1)?.title,'Offload / Backload / Demurrage');assert.equal(phases.at(-1)?.milestones.length,0);
 assert.equal(delivery.milestones.find(m=>m.type==='UNLOADING_STARTED')?.pending,true);
});
test('report titles do not fabricate report categories and saved report associations remain correct',()=>{
 const linked={...event('report','BACKLOAD_REPORTED',16),delivery_metadata:{report_id:'backload',report_type:'BACKLOAD'}};
 const ops={backloads:[{id:'backload',trip_id:trip,trip_stop_id:stop,status:'PENDING',comments:'Saved backload'}],offloads:[{id:'offload',trip_id:trip,trip_stop_id:stop,status:'OPEN'}],exception_reports:[{id:'demurrage',trip_id:trip,trip_stop_id:stop,report_type:'DEMURRAGE',source:'demurrages',reported_at:'2026-10-27T17:00:00Z'},{id:'incident',trip_id:trip,trip_stop_id:stop,report_type:'INCIDENT',source:'incidents',incident_category:'Accident',created_at:'2026-10-27T18:00:00Z'}]};
 const phases=operationalPhases(input([event('custom','CUSTOM_STATUS',9,'Demurrage discussion'),linked],{loading:[],unloading:[],stops:[],...ops}));
 assert.deepEqual(new Set(phases.at(-1)!.milestones.map(m=>m.reportId)),new Set(['backload','offload','demurrage']));
 const custom=phases.flatMap(p=>p.milestones).find(m=>m.key==='custom')!;assert.equal(isOperationalReport(custom),false);
 const incident=phases.flatMap(p=>p.milestones).find(m=>m.key==='incidents:incident')!;assert.equal(isOperationalReport(incident),false);assert.equal(incident.scope,'trip-wide');
});
test('custom updates made during loading stay between loading milestones even when they reference the next stop',()=>{
 const phases=operationalPhases(input([event('start','LOADING_STARTED',8),event('status','CUSTOM_STATUS',9,'Waiting'),event('depart','WAREHOUSE_DEPARTURE',10)]));
 assert.deepEqual(phases[0].milestones.filter(m=>m.time).map(m=>m.key),['start','status','depart']);
});

test('warehouse departure does not fabricate an On the Way event',()=>{
 const phases=operationalPhases(input([event('depart','WAREHOUSE_DEPARTURE',10),event('traffic','CUSTOM_STATUS',11,'Traffic'),event('arrive','ARRIVED',12)]));
 const delivery=phases.find(p=>p.key===stop)!;
 assert.deepEqual(delivery.milestones.filter(m=>m.time).map(m=>m.type),['CUSTOM_STATUS','ARRIVED']);
 assert.equal(delivery.milestones.some(m=>m.type==='IN_TRANSIT'),false);
 const traveling=operationalPhases(input([event('depart','WAREHOUSE_DEPARTURE',10)]));assert.equal(milestoneTone(traveling[1].milestones[0]),'pending');
 const planned=operationalPhases(input([]));assert.equal(planned[1].milestones[0].time,null);
});

test('next assigned stop requires its own explicit travel event',()=>{
 const source=input([event('depart','WAREHOUSE_DEPARTURE',10),event('leave','STOP_DEPARTURE',12)]);
 source.data.stops.push({id:'next-stop',name:'Next destination',sequence:2});
 const next=operationalPhases(source).find(p=>p.key==='next-stop')!;
 assert.equal(next.milestones[0].type,'IN_TRANSIT');assert.equal(next.milestones[0].event,undefined);assert.equal(next.milestones[0].time,null);
});


test('another truck departure cannot activate the selected truck through trip-wide timestamp fallbacks',()=>{
 const value=input([event('other-depart','WAREHOUSE_DEPARTURE',10,undefined,'other-assignment')]);value.trip.departure_from_warehouse_at='2026-10-27T10:00:00Z';const phases=operationalPhases(value);
 assert.equal(phases[0].milestones.find(m=>m.type==='WAREHOUSE_DEPARTURE')?.time,null);assert.equal(phases.find(p=>p.key===stop)?.milestones.find(m=>m.type==='IN_TRANSIT')?.time,null);
});
