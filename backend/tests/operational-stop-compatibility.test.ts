import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAdmin as db} from '../src/config/supabase.js';
import {createTripStopRecord} from '../src/services/trip.service.js';
test('legacy Add Stop requests create Planned rows using the five active workflow options',async()=>{
 const original=db.from;let inserted:any;
 (db as any).from=(table:string)=>{let status='';const q:any={select:()=>q,eq:(field:string,value:string)=>{if(field==='option_value')status=value;return q;},insert:(payload:any)=>{inserted=payload;return q;},maybeSingle:async()=>({data:table==='trips'?{id:'00000000-0000-4000-8000-000000000001'}:status==='PLANNED'?{option_value:status}:null,error:null}),single:async()=>({data:{id:'00000000-0000-4000-8000-000000000002',...inserted},error:null})};return q;};
 try{const row=await createTripStopRecord('00000000-0000-4000-8000-000000000001',{stop_sequence:1,delivery_status:'PENDING'});assert.equal(row.delivery_status,'PLANNED');assert.equal(inserted.delivery_status,'PLANNED');}finally{db.from=original;}
});
