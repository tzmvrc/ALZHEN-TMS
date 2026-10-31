import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('convoy progress uses exact assignment/stop completions; approval alone and another truck do not complete a stop',async()=>{
 process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated';process.env.SUPABASE_ANON_KEY='isolated';
 const {projectActiveTrips}=await import('../src/services/home-active-trips.service.js');
 const trips=[{id:id(1),status:'IN_PROGRESS'}],assignments=[{id:id(2),trip_id:id(1),stop_scope:'ALL',driver_id:id(20),driver:{first_name:'Primary',last_name:'Driver'},truck:{plate_number:'A'}},{id:id(3),trip_id:id(1),stop_scope:'SELECTED',truck:{plate_number:'B'}}];
 const stops=[4,5].map((n,index)=>({id:id(n),trip_id:id(1),stop_sequence:index+1,delivery_location:'Repeated store'}));
 const responsibilities=[{assignment_id:id(3),trip_stop_id:id(4)}];
 const states:any[]=[{trip_id:id(1),assignment_id:id(2),trip_stop_id:id(4),departure_time:'2026-10-30T01:00:00Z',pod_approved:false},{trip_id:id(1),assignment_id:id(2),trip_stop_id:id(5),pod_approved:true},{trip_id:id(1),assignment_id:id(3),trip_stop_id:id(4),pod_approved:true},{trip_id:id(9),assignment_id:id(3),trip_stop_id:id(4),departure_time:'2026-10-30T01:00:00Z'}];
 const crew=[{id:id(30),assignment_id:id(2),profile_id:id(31),crew_role:'HELPER',profile:{first_name:'Helper',last_name:'Two'}},{id:id(32),assignment_id:id(2),profile_id:id(33),crew_role:'HELPER',profile:{first_name:'Helper',last_name:'One'}}];
 const [trip]=projectActiveTrips(trips,assignments,stops,responsibilities,crew,states);
 assert.equal(trip.trucks[0].progress.percent,50);assert.equal(trip.trucks[1].progress.percent,0);assert.equal(trip.progress.percent,0);assert.equal(trip.trucks[0].crew_count,3);assert.equal(trip.trucks[0].helpers[0].name,'Helper One');
 states[2].departure_time='2026-10-30T02:00:00Z';const [changed]=projectActiveTrips(trips,assignments,stops,responsibilities,crew,states);assert.equal(changed.progress.percent,50);assert.equal(changed.trucks[1].progress.percent,100);
 assert.equal(projectActiveTrips(trips,assignments,stops,responsibilities,crew,[])[0].progress.percent,null,'Missing projection is neutral');
 assert.equal(projectActiveTrips(trips,[],[],[],[],[])[0].progress.percent,null,'No configured stops is neutral');
});
test('search projection preserves canonical archive visibility and one row per trip while searching fleet labels',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role service_role;create role anon;create role authenticated;
 create table trips(id uuid primary key,trip_reference text,trip_number integer,dispatch_number text,warehouse_id uuid,status text,archived_at timestamptz);
 create table warehouses(id uuid,name text);create table trucks(id uuid,plate_number text);create table drivers(id uuid,first_name text,last_name text);
 create table trip_truck_assignments(id uuid,trip_id uuid,truck_id uuid,driver_id uuid,unassigned_at timestamptz,stop_scope text);
 create table customer_stores(id uuid,name text);create table trip_stops(id uuid,trip_id uuid,delivery_location text,store_id uuid,archived_at timestamptz,stop_sequence int);
 create table trip_assignment_stops(id uuid,assignment_id uuid,trip_stop_id uuid);
 create table profiles(id uuid,first_name text,last_name text);create table trip_truck_crew_members(id uuid,assignment_id uuid,profile_id uuid,removed_at timestamptz);
 insert into trips values('${id(1)}','TRIP-A',1,'SHARED',null,'IN_PROGRESS',null),('${id(2)}','TRIP-B',2,'SHARED',null,'IN_PROGRESS',null),('${id(3)}','ARCHIVED',3,'SHARED',null,'IN_PROGRESS',now()),('${id(4)}','DONE',4,'SHARED',null,'COMPLETED',null),('${id(5)}','CANCEL',5,'SHARED',null,'CANCELLED',null),('${id(6)}','ARCHIVED-STOP',6,'SHARED',null,'IN_PROGRESS',null);
 insert into trucks values('${id(10)}','CBP 4369');insert into drivers values('${id(11)}','John','Doe');
 insert into trip_truck_assignments values('${id(12)}','${id(1)}','${id(10)}','${id(11)}',null,'ALL'),('${id(13)}','${id(1)}','${id(10)}','${id(11)}',null,'ALL'),('${id(19)}','${id(2)}','${id(10)}','${id(11)}',now(),'ALL');
 insert into profiles values('${id(14)}','Helper','Santos');insert into trip_truck_crew_members values('${id(15)}','${id(12)}','${id(14)}',null);
 insert into trip_stops values('${id(16)}','${id(1)}','Iligan',null,null,1),('${id(17)}','${id(2)}','Zamboanga',null,null,1),('${id(18)}','${id(6)}','Archived destination',null,now(),1);`);
 await db.exec(await readFile(new URL('../migrations/2026_10_24_active_trip_listing_plan.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../migrations/2026_11_26_home_active_trip_search.sql',import.meta.url),'utf8'));
 const active=await db.query<any>("select id from v_home_trip_listing where status='IN_PROGRESS'");assert.equal(active.rows.length,2);assert.equal(new Set(active.rows.map(row=>row.id)).size,2);
 for(const word of ['CBP 4369','John Doe','Helper Santos','Iligan'])assert.deepEqual((await db.query<any>("select id from v_home_trip_listing where status='IN_PROGRESS' and _home_search_text ilike $1",['%'+word+'%'])).rows.map(row=>row.id),[id(1)]);
 assert.equal((await db.query<any>("select has_table_privilege('authenticated','v_home_trip_listing','select') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
test('active overview paginates before batched enrichment and retains the dashboard total during search',async()=>{
 process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated';process.env.SUPABASE_ANON_KEY='isolated';
 const {supabaseAdmin}=await import('../src/config/supabase.js'),{homeActiveTrips}=await import('../src/services/home-active-trips.service.js');
 const originalFrom=supabaseAdmin.from,originalRpc=supabaseAdmin.rpc,reads:any[]=[],rpc:any[]=[];
 const records=Array.from({length:61},(_,index)=>({id:id(index+1),trip_reference:`TRIP-${index+1}`,status:'IN_PROGRESS',loading_date:'2026-10-30'}));
 (supabaseAdmin as any).from=(table:string)=>{let from=0,to=999,search=false;const filters:any[]=[];const chain:any={select:()=>chain,eq:(key:string,value:any)=>{filters.push([key,value]);return chain;},is:(key:string,value:any)=>{filters.push([key,value]);return chain;},in:(key:string,value:any)=>{filters.push([key,value]);return chain;},order:()=>chain,range:(a:number,b:number)=>{from=a;to=b;return chain;},or:()=>{search=true;return chain;},then:(resolve:any)=>{reads.push({table,filters,from,to});const rows=['v_home_trip_listing','v_active_trip_listing'].includes(table)?search?records.slice(0,1):records:[];return Promise.resolve({data:rows.slice(from,to+1),count:rows.length,error:null}).then(resolve);}};return chain;};
 (supabaseAdmin as any).rpc=async(name:string,args:any)=>{rpc.push({name,args});return {data:[],error:null};};
 try{
 const page=await homeActiveTrips({page:'2',limit:'25'});assert.equal(page.rows.length,25);assert.equal(page.rows[0].id,id(26));assert.equal(page.active_total,61);assert.equal(page.pagination.totalPages,3);assert.equal(rpc.length,1);assert.equal(rpc[0].args.p_trips.length,25);assert.ok(reads.length<=6,'No per-trip requests');assert.ok(!reads.some(read=>read.table==='trip_truck_crew_members'),'Compact list does not fetch unused crew details');assert.equal(Object.hasOwn(page.rows[0],'trucks'),false);
 const filtered=await homeActiveTrips({search:'John Doe'});assert.equal(filtered.pagination.total,1);assert.equal(filtered.active_total,61);assert.ok(reads.filter(read=>read.table==='v_home_trip_listing').every(read=>read.filters.some(([key,value]:any)=>key==='status'&&value==='IN_PROGRESS')));
 (supabaseAdmin as any).rpc=async()=>({data:null,error:{message:'Isolated unavailable projection'}});const neutral=await homeActiveTrips({limit:'1'});assert.equal(neutral.rows.length,1);assert.equal(neutral.rows[0].progress.percent,null);assert.ok('warning' in neutral);
 await assert.rejects(homeActiveTrips({search:['bad']}),/Invalid/);
 }finally{supabaseAdmin.from=originalFrom;supabaseAdmin.rpc=originalRpc;}
});
