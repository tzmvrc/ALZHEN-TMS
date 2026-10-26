import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAdmin as db} from '../src/config/supabase.js';
import {getTripEvents} from '../src/services/trip.service.js';
test('trip history reads every bounded cursor page, including equal timestamps, without a default row-cap truncation',async()=>{
 const original=db.from,trip='00000000-0000-4000-9000-000000000999';
 const rows=Array.from({length:1201},(_,n)=>({id:`00000000-0000-4000-9000-${String(n).padStart(12,'0')}`,trip_id:trip,event_time:'2026-10-26T00:00:00+00:00',event_type:'CUSTOM_STATUS'}));let calls=0;
 db.from=((table:string)=>{assert.equal(table,'trip_events');let after='',size=0;const query={select:()=>query,eq:(field:string,id:string)=>{assert.equal(field,'trip_id');assert.equal(id,trip);return query;},order:()=>query,limit:(n:number)=>{size=n;return query;},or:(filter:string)=>{after=filter.match(/id.gt.([0-9a-f-]{36})/)?.[1]??'';assert.ok(after);return query;},then:(resolve:any)=>{calls++;assert.equal(size,500);return Promise.resolve({data:rows.filter(row=>row.id>after).slice(0,size),error:null}).then(resolve);}};return query;}) as typeof original;
 try{const result=await getTripEvents(trip);assert.equal(result.length,1201);assert.equal(new Set(result.map(row=>row.id)).size,1201);assert.equal(calls,3);await assert.rejects(getTripEvents('invalid'),/Invalid trip/);assert.equal(calls,3);}finally{db.from=original;}
});
