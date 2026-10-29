import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';process.env.SUPABASE_ANON_KEY='isolated-test';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('ordinary trucker timeline responses include the document decision and exclude private Storage/OCR data',async()=>{
 const {supabaseAdmin:db}=await import('../src/config/supabase.js');const {deliveryEvents}=await import('../src/services/delivery-workspace.service.js');
 const original=db.from;let attachmentSelect='';
 db.from=((table:string)=>{let single=false;const q={select:(fields:string)=>{if(table==='trip_images')attachmentSelect=fields;return q;},eq:()=>q,or:()=>q,in:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>{single=true;return q;},then:(resolve:any,reject:any)=>{const rows=table==='trip_truck_assignments'?[{id:id(2),trip_id:id(3),driver:{profile_id:id(1)},trip:{status:'IN_PROGRESS'}}]:table==='trip_events'?[{id:id(4),assignment_id:id(2),trip_id:id(3),trip_stop_id:id(5),event_type:'POD_SUBMITTED',event_time:'2026-10-28T00:00:00Z',delivery_metadata:{}}]:[{id:id(6),delivery_event_id:id(4),kind:'receipt',file_name:'pod.png',pod_review_status:'APPROVED',pod_review_version:1,storage_path:'PRIVATE',ocr_text:'PRIVATE OCR',ocr_confidence:99,mime_type:'image/png'}];return Promise.resolve({data:single?rows[0]:rows,error:null}).then(resolve,reject);}};return q;}) as typeof db.from;
 try{const result=await deliveryEvents({id:id(1),role:'TRUCKER'},id(2));const page=result.rows[0].attachments[0] as Record<string,unknown>;assert.match(attachmentSelect,/pod_review_status/);assert.equal(page.pod_review_status,'APPROVED');assert.equal(page.pod_review_version,1);for(const key of ['storage_path','ocr_text','url'])assert.equal(key in page,false);}finally{db.from=original;}
});
