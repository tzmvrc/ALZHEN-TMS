import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated';process.env.SUPABASE_ANON_KEY='isolated';
test('login refuses locked accounts before creating application access and records server-parsed device metadata on success',async()=>{
 const {supabaseAdmin:db,supabaseAuth}=await import('../src/config/supabase.js');
 const {loginAppUser}=await import('../src/services/auth.service.js');
 const {browserMetadata}=await import('../src/services/device-session.service.js');
 const original={from:db.from,rpc:db.rpc,login:supabaseAuth.auth.signInWithPassword};
 const id='00000000-0000-4000-8000-000000000001';let locked=true,registrations=0,legacyWrites=0;
 supabaseAuth.auth.signInWithPassword=(async()=>({data:{user:{id},session:{access_token:'isolated-token',refresh_token:'not-persisted-by-tracking'}},error:null})) as any;
 db.from=((table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='profiles'?{id,role:'TRUCKER',locked_at:locked?'2026-10-26T00:00:00Z':null}:null,error:null}),upsert:async()=>{legacyWrites++;return {error:null};}};return q;}) as any;
 db.rpc=(async(name:string,args:any)=>{assert.equal(name,'register_device_session_v1');registrations++;assert.equal(args.p_metadata.browser_name,'Chrome');assert.equal(args.p_metadata.operating_system,'Windows');assert.equal(args.p_hash.length,64);assert.ok(!JSON.stringify(args).includes('not-persisted-by-tracking'));return {data:null,error:null};}) as any;
 try{
  await assert.rejects(loginAppUser('isolated@example.invalid','fixture-password'),(e:any)=>e.code==='ACCOUNT_LOCKED'&&e.statusCode===403);assert.equal(legacyWrites,0);assert.equal(registrations,0);
  locked=false;const result=await loginAppUser('isolated@example.invalid','fixture-password',browserMetadata('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36'));
  assert.equal(result.profile.id,id);assert.equal(result.appSessionId.length,43);assert.equal(registrations,1);
  assert.equal(browserMetadata('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1').operating_system,'iPhone');
  assert.equal(browserMetadata('Mozilla/5.0 (iPhone) Version/18.0 Safari/604.1').browser_name,'Safari');
 }finally{db.from=original.from;db.rpc=original.rpc;supabaseAuth.auth.signInWithPassword=original.login;}
});
