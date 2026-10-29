import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';process.env.SUPABASE_ANON_KEY='isolated-test';
test('submitted preview authorizes assignment and uploader before signing originals',async()=>{
 const {supabaseAdmin:db}=await import('../src/config/supabase.js');
 const {deliveryReceipts}=await import('../src/services/delivery-workspace.service.js');
 const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const owner=id(1),other=id(2),assignment=id(3),trip=id(4),signed:string[]=[];
 const seeds:Record<string,any[]>={trip_truck_assignments:[{id:assignment,trip_id:trip,driver:{profile_id:owner},trip:{status:'IN_PROGRESS'}}],trip_images:[{id:id(10),trip_id:trip,assignment_id:assignment,kind:'receipt',delivery_upload_state:'READY',uploaded_by:owner,storage_path:'OWN-REJECTED',pod_review_status:'REJECTED'},{id:id(11),trip_id:trip,assignment_id:id(99),kind:'receipt',delivery_upload_state:'READY',uploaded_by:other,storage_path:'OTHER-TRUCK'},{id:id(12),trip_id:trip,assignment_id:assignment,kind:'receipt',delivery_upload_state:'PENDING',uploaded_by:owner,storage_path:'UNFINISHED'},{id:id(13),trip_id:trip,assignment_id:assignment,kind:'receipt',delivery_upload_state:'READY',uploaded_by:other,storage_path:'OTHER-UPLOADER'}]};
 const original=db.from,storage=db.storage.from;
 db.from=((table:string)=>{let single=false;const filters:Array<(row:any)=>boolean>=[];const query={select:()=>query,eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return query;},order:()=>query,limit:()=>query,maybeSingle:()=>{single=true;return query;},then:(resolve:any,reject:any)=>{const rows=(seeds[table]??[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject);}};return query;}) as typeof original;
 db.storage.from=(()=>({createSignedUrl:async(path:string)=>{signed.push(path);return {data:{signedUrl:'https://isolated.invalid/'+path},error:null};}})) as typeof storage;
 try{
  await assert.rejects(deliveryReceipts({id:other,role:'TRUCKER'},assignment),/not available/);assert.equal(signed.length,0);
  const rows=await deliveryReceipts({id:owner,role:'TRUCKER'},assignment);assert.equal(rows.length,1);assert.equal(rows[0].pod_review_status,'REJECTED');assert.deepEqual(signed,['OWN-REJECTED']);
 }finally{db.from=original;db.storage.from=storage;}
});
