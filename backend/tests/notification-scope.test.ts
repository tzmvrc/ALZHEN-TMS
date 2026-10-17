import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
test("notification reads and read-status writes stay scoped to the authenticated recipient",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");const {listNotifications,markNotificationRead,markAllNotificationsRead}=await import("../src/services/notification.service.js");
 const mine="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002";
 const rows=[{id:mine,recipient_profile_id:"owner",notification_type:"pod_approved",reference_type:"trip",metadata:{},read_at:null},{id:other,recipient_profile_id:"other",notification_type:"pod_rejected",reference_type:"trip",metadata:{},read_at:null}];
 const original=supabaseAdmin.from;
 supabaseAdmin.from=((table:string)=>{
  assert.equal(table,"admin_notifications");const filters:Array<(row:typeof rows[number])=>boolean>=[];let patch:Record<string,unknown>|null=null,single=false;
  const chain={select:()=>chain,order:()=>chain,limit:()=>chain,eq:(key:string,value:unknown)=>{filters.push(row=>row[key as keyof typeof row]===value);return chain;},is:(key:string,value:unknown)=>{filters.push(row=>row[key as keyof typeof row]===value);return chain;},update:(value:Record<string,unknown>)=>{patch=value;return chain;},maybeSingle:()=>{single=true;return chain;},then:(resolve:(value:unknown)=>unknown,reject:(value:unknown)=>unknown)=>{const matched=rows.filter(row=>filters.every(fn=>fn(row)));if(patch)matched.forEach(row=>Object.assign(row,patch));return Promise.resolve({data:single?matched[0]??null:matched,count:matched.length,error:null}).then(resolve,reject);}};return chain;
 }) as typeof original;
 try{
  assert.deepEqual((await listNotifications('owner')).notifications.map(row=>row.id),[mine]);
  assert.equal(await markNotificationRead('owner',other),null);assert.equal(rows[1].read_at,null);
  await markAllNotificationsRead('owner');assert.ok(rows[0].read_at);assert.equal(rows[1].read_at,null);
 }finally{supabaseAdmin.from=original;}
});
