import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL='http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';
process.env.SUPABASE_ANON_KEY='isolated-test';

test('a trip without a warehouse still returns its assigned stops and remaining cargo',async()=>{
 const {supabaseAdmin}=await import('../src/config/supabase.js');
 const {deliveryWorkspace}=await import('../src/services/delivery-workspace.service.js');
 const original=supabaseAdmin.from;
 const profile='00000000-0000-4000-8000-000000000001',assignment='00000000-0000-4000-8000-000000000002';
 let warehouseId:string|null=null,warehouseReads=0;
 (supabaseAdmin as any).from=(table:string)=>{
  if(table==='warehouses')warehouseReads++;
  const data:Record<string,unknown>={
   trip_truck_assignments:{id:assignment,trip_id:'trip',driver:{profile_id:profile},trip:{warehouse_id:warehouseId},stop_scope:'SELECTED'},
   trip_stops:[{id:'stop',stop_sequence:1}],trip_assignment_stops:[{trip_stop_id:'stop',progress:'PENDING'}],
   trip_cargo_allocations:[{id:'cargo',quantity:12,allocated_cbm:8.4,line:{trip_stop_id:'stop'}}],
   trip_delivery_quantities:[{allocation_id:'cargo',quantity:2}],trip_events:[],warehouses:{id:warehouseId,name:'Saved warehouse'},
  };
  const chain:any={select:()=>chain,eq:(_:string,value:unknown)=>{assert.notEqual(value,null,'Do not send null UUID filters');return chain;},order:()=>chain,limit:()=>chain,in:()=>chain,maybeSingle:()=>chain,
   then:(resolve:any,reject:any)=>Promise.resolve({data:data[table],error:null}).then(resolve,reject)};
  return chain;
 };
 try{
  const missing=await deliveryWorkspace({id:profile,role:'TRUCKER'},assignment);
  assert.equal(missing.warehouse,null);assert.equal(warehouseReads,0);
  assert.equal(missing.stops.length,1);assert.equal(missing.cargo[0].remaining,10);assert.deepEqual(missing.milestones,[]);
  warehouseId='00000000-0000-4000-8000-000000000003';
  const configured=await deliveryWorkspace({id:profile,role:'TRUCKER'},assignment);
  assert.equal(configured.warehouse?.name,'Saved warehouse');assert.equal(warehouseReads,1);
  await assert.rejects(deliveryWorkspace({id:'00000000-0000-4000-8000-000000000004',role:'TRUCKER'},assignment),/not available/);
 }finally{supabaseAdmin.from=original;}
});

test('current trip resolution uses the master truck, skips finished work and resolves one assignment automatically',async()=>{
 const {supabaseAdmin:db}=await import('../src/config/supabase.js');
 const {currentDeliveryWorkspace}=await import('../src/services/delivery-workspace.service.js');
 const original=db.from,profile='00000000-0000-4000-8000-000000000001';
 const first='00000000-0000-4000-8000-000000000011',current='00000000-0000-4000-8000-000000000012';let completed=false;
 const assignments=[{id:first,truck_id:'other-truck',trip:{id:'trip-other',status:'PLANNED'}},{id:current,truck_id:'master-truck',trip:{id:'trip-current',status:'PLANNED'}}];
 (db as any).from=(table:string)=>{
  let filters:Record<string,unknown>={},single=false;
  const chain:any={select:()=>chain,eq:(key:string,value:unknown)=>{filters[key]=value;return chain;},is:()=>chain,order:()=>chain,limit:()=>chain,in:()=>chain,maybeSingle:()=>{single=true;return chain;},then:(resolve:any,reject:any)=>{
   let data:any=[];
   if(table==='drivers')data={id:'driver',assigned_truck_id:'master-truck'};
   if(table==='trip_truck_assignments')data=single?{...assignments.find(a=>a.id===filters.id),driver:{profile_id:profile},trip_id:filters.id===current?'trip-current':'trip-other',stop_scope:'ALL'}:assignments;
   if(table==='trip_events')data=completed&&filters.assignment_id===current?[{event_type:'ASSIGNMENT_COMPLETED'}]:[];
   return Promise.resolve({data,error:null}).then(resolve,reject);
  }};return chain;
 };
 try{
  assert.equal((await currentDeliveryWorkspace({id:profile,role:'TRUCKER'}))?.assignment.id,current);
  completed=true;assert.equal((await currentDeliveryWorkspace({id:profile,role:'TRUCKER'}))?.assignment.id,first);
  assignments[0].trip.status='CANCELLED';assert.equal(await currentDeliveryWorkspace({id:profile,role:'TRUCKER'}),null);
 }finally{db.from=original;}
});
