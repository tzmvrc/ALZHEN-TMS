// Purely local, disposable PostgreSQL. No environment credentials or network.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
const schema=JSON.parse(await readFile(new URL('../tests/fixtures/spreadsheet-scale-schema.json',import.meta.url),'utf8'));
const seed=JSON.parse(await readFile(new URL('../tests/fixtures/spreadsheet-scale-demo.json',import.meta.url),'utf8'));
const copies=Number(process.argv[2]??334);
if(!Number.isInteger(copies)||copies<1||copies>500)throw Error('Use 1 to 500 local fixture copies');
const db=new PGlite();const identifier=name=>'"'+name.replaceAll('"','""')+'"';
const uniqueText=new Set(['dispatch_number','trip_reference','transaction_number','code','name','plate_number','email','sku']);
const remap=(value,batch)=>{
 if(typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)){
  const hex=createHash('md5').update(value+':fixture:'+batch).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
 }
 if(Array.isArray(value))return value.map(v=>remap(v,batch));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v,batch)]));
 return value;
};
try{
 for(const definition of schema.functions??[])await db.exec(definition);
 for(const type of schema.enums??[])await db.exec(`create type ${identifier(type.name)} as enum (${type.values.map(v=>"'"+v.replaceAll("'","''")+"'").join(',')})`);
 for(const table of schema.tables)await db.exec(`create table ${identifier(table.name)} (${table.columns.map(c=>identifier(c.name)+' '+c.type).join(',')})`);
 let recordCount=0;const started=performance.now();
 for(const table of schema.tables){
  let rows=[];
  const flush=async()=>{if(!rows.length)return;await db.query(`insert into ${identifier(table.name)} select * from jsonb_populate_recordset(null::${identifier(table.name)},$1::jsonb)`,[JSON.stringify(rows)]);recordCount+=rows.length;rows=[];};
  for(let batch=1;batch<=copies;batch++)for(const original of seed[table.name]??[]){const row=remap(original,batch);for(const key of uniqueText)if(typeof row[key]==='string')row[key]+=` [Fixture ${batch}]`;rows.push(row);if(rows.length>=1000)await flush();}
  await flush();
  for(const index of table.indexes??[])await db.exec(index);
 }
 const remaining=[...schema.views];let progress=true;
 while(remaining.length&&progress){progress=false;for(let i=remaining.length-1;i>=0;i--)try{await db.exec(`create view public.${identifier(remaining[i].name)} as ${remaining[i].sql}`);remaining.splice(i,1);progress=true;}catch(error){remaining[i].lastError=error.message;}}
 if(remaining.length)throw Error(JSON.stringify(remaining.map(v=>({view:v.name,error:v.lastError}))));
 if(!process.argv.includes('--baseline'))await db.exec(await readFile(new URL('../migrations/2026_10_24_master_list_lateral_plans.sql',import.meta.url),'utf8'));
 await db.exec('analyze');
 if(process.argv.includes('--interactive')){
  console.log(JSON.stringify({ready:true,trips:30*copies,physicalMasterRows:120*copies}));
  const input=createInterface({input:process.stdin});
  for await(const line of input){if(line==='exit')break;try{const command=JSON.parse(line),start=performance.now();const result=await db.query(command.sql);
   if(command.explain){const p=result.rows[0]['QUERY PLAN'][0],nodes=[];const walk=n=>{nodes.push({node:n['Node Type'],relation:n['Relation Name'],index:n['Index Name'],rows:n['Actual Rows'],loops:n['Actual Loops'],ms:n['Actual Total Time'],removed:n['Rows Removed by Filter'],join:n['Join Filter'],condition:n['Index Cond'],children:n.Plans?.map(c=>({node:c['Node Type'],relation:c['Relation Name']}))});for(const child of n.Plans??[])walk(child);};walk(p.Plan);console.log(JSON.stringify({execution:p['Execution Time'],planning:p['Planning Time'],nodes:nodes.sort((a,b)=>b.ms*b.loops-a.ms*a.loops).slice(0,30)}));}
   else console.log(JSON.stringify({ms:Math.round(performance.now()-start),rows:result.rows.length,...(command.result?{result:result.rows}:{} )}));
  }catch(error){console.log(JSON.stringify({error:error.message}));}}
  process.exitCode=0;
 }else{
 const queries=[
  ['master-page',`select * from v_trip_master_csv order by loading_date desc,_trip_id,_trip_stop_id,_trip_line_item_id,_assignment_id limit 50`],
  ['master-deep-page',`select * from v_trip_master_csv order by loading_date desc,_trip_id,_trip_stop_id,_trip_line_item_id,_assignment_id limit 50 offset ${Math.min(20000,120*copies-50)}`],
  ['master-count',`select count(*) n from v_trip_master_csv`],
  ['master-search',`select * from v_trip_master_csv where _search_text ilike '%mArIkInA%' order by loading_date desc,_trip_id limit 50`],
  ['monitor-filter',`select * from v_dispatch_monitoring where _filter_in_progress order by loading_date desc,_trip_id limit 50`],
  ['dispatch-page',`select * from v_dispatch_report order by loading_date desc,_trip_id limit 50`],
  ['combined-page',`select * from v_tms_combined order by loading_date desc,_trip_id limit 50`],
  ['booking-page',`select * from v_trip_booking order by loading_date desc,_trip_id limit 50`],
  ['operations-page',`select source_type,source_record_id,trip_id,trip_stop_id,dr_number,quantity,total_cbm,route,date,reported_by from v_operations_report_page order by date desc,source_type,source_record_id limit 50`],
  ['tracker-page',`select * from v_transmittal_tracker_page order by trip_stop_id,assignment_id limit 50`],
 ];
 const results=[];for(const [name,sql] of queries){const start=performance.now();const result=await db.query(sql);results.push({name,rows:result.rows.length,ms:Math.round(performance.now()-start)});if(name==='master-count')assert.equal(Number(result.rows[0].n),120*copies);else assert.equal(result.rows.length,50,name);}
 console.log(JSON.stringify({isolated:true,trips:30*copies,physicalMasterRows:120*copies,relatedRecords:recordCount,setupMs:Math.round(performance.now()-started),queries:results},null,2));
 }
}catch(error){console.error(JSON.stringify({error:error.message,query:error.query?.slice(0,180)}));process.exitCode=1;}finally{await db.close();}
