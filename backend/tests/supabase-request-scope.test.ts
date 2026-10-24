import test from 'node:test';
import assert from 'node:assert/strict';
import {withSupabaseDeadline} from '../src/utils/supabase-request-scope.js';
import {timedSupabaseFetch} from '../src/utils/report-read-timing.js';
test('background deadline bounds RPC/Auth/Storage fetches and does not alter unscoped requests',async()=>{
 const original=globalThis.fetch;const caller=new AbortController();let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;assert.ok(init?.signal);return new Promise((_resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Deadline missing')),1000);const abort=()=>{clearTimeout(timer);reject(new DOMException('Timed out','TimeoutError'));};if(init!.signal!.aborted)abort();else init!.signal!.addEventListener('abort',abort,{once:true});});};
 try{for(const path of ['/rest/v1/rpc/claim','/auth/v1/admin/users/fixture','/storage/v1/object/fixture'])await assert.rejects(withSupabaseDeadline(20,()=>timedSupabaseFetch('https://example.invalid'+path,{method:'POST',signal:caller.signal})),{name:'AbortError'});
 assert.equal(calls,3);assert.equal(caller.signal.aborted,false);globalThis.fetch=async(_input,init)=>{assert.equal(init?.signal,caller.signal);return new Response('{}');};await timedSupabaseFetch('https://example.invalid/rest/v1/rpc/unscoped',{method:'POST',signal:caller.signal});
 }finally{globalThis.fetch=original;}
});
test('installed PostgREST SDK does not retry a deadline imposed inside the background fetch scope',async()=>{
 const {createClient}=await import('@supabase/supabase-js');const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;return new Promise((_resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing scoped abort')),1000);const abort=()=>{clearTimeout(timer);reject(new DOMException('Timed out','TimeoutError'));};if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true});});};
 try{const client=createClient('https://example.invalid','isolated-fixture-key',{global:{fetch:timedSupabaseFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const start=performance.now();const response=await withSupabaseDeadline(20,async()=>await client.from('profiles').select('id'));assert.ok(response.error);assert.equal(calls,1);assert.ok(performance.now()-start<1000);
 }finally{globalThis.fetch=original;}
});
