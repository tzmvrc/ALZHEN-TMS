import test from "node:test";
import assert from "node:assert/strict";
import {validatePodDocument} from "../src/services/pod-document.logic.js";
import {captureIsNewer,destinationFingerprint,planRoadRoute,validateTrackingCapture} from "../src/services/tracking.logic.js";
test("PDF preparation preserves cap/signature/hash, remains disabled by default, and rejects active or encrypted documents",()=>{
 const bytes=Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
 assert.throws(()=>validatePodDocument(bytes,"application/pdf","fixture.pdf"),/awaits approved/);
 const file=validatePodDocument(bytes,"application/pdf","fixture.pdf",true);assert.equal(file.mime_type,"application/pdf");assert.equal(file.file_sha256.length,64);assert.equal(validatePodDocument(bytes,"application/pdf","fixture.pdf",true).file_sha256,file.file_sha256);
 for(const body of ['not a PDF','%PDF-1.7\n/Encrypt\n%%EOF','%PDF-1.7\n/JavaScript\n%%EOF','%PDF-1.7\n/Launch\n%%EOF'])assert.throws(()=>validatePodDocument(Buffer.from(body),"application/pdf","fixture.pdf",true));
 assert.throws(()=>validatePodDocument(bytes,"image/jpeg","fixture.jpg",true));assert.throws(()=>validatePodDocument(Buffer.alloc(5*1024*1024+1),"application/pdf","large.pdf",true));
});
test("GPS captures require fresh timezone-safe coordinates/accuracy and never replace newer captures",()=>{
 const now=Date.parse('2026-10-17T01:00:00Z'),input={latitude:0,longitude:0,accuracy_meters:4,captured_at:'2026-10-17T09:00:00+08:00'};
 const capture=validateTrackingCapture(input,now);assert.equal(capture.latitude,0);assert.equal(capture.captured_at,'2026-10-17T01:00:00.000Z');assert.equal(captureIsNewer(capture.captured_at,capture.captured_at),false);assert.equal(captureIsNewer(capture.captured_at,'2026-10-17T00:59:59Z'),true);
 for(const patch of [{latitude:91},{longitude:Infinity},{accuracy_meters:-1},{captured_at:'2026-10-17T01:00:00'},{captured_at:'2026-10-17T00:00:00Z'},{captured_at:'2026-10-18T01:00:00Z'}])assert.throws(()=>validateTrackingCapture({...input,...patch},now));
});
test("ten independent route plans reuse hourly geometry while marker movements stay independent",()=>{
 const now=Date.now(),points=[{id:'stop-a',latitude:10,longitude:123},{id:'stop-b',latitude:11,longitude:124}];
 const fingerprints=new Set<string>();let requests=0;
 for(let i=0;i<10;i++){
  const fingerprint=destinationFingerprint(`assignment-${i}`,points);fingerprints.add(fingerprint);
  const base={active:true,hasPosition:true,fingerprint,cachedFingerprint:null,calculatedAt:null,leaseUntil:null,retryAfter:null};if(planRoadRoute(base,now).fetch)requests++;
  const cached={...base,cachedFingerprint:fingerprint,calculatedAt:now};assert.equal(planRoadRoute(cached,now+30000).fetch,false);assert.equal(planRoadRoute(cached,now+3600000).reason,'HOURLY_REFRESH');assert.equal(planRoadRoute({...cached,active:false},now).fetch,false);assert.equal(planRoadRoute({...cached,leaseUntil:now+1000,fingerprint:'changed'},now).fetch,false);assert.equal(planRoadRoute({...cached,retryAfter:now+5000},now).fetch,false);
 }
 assert.equal(fingerprints.size,10);assert.equal(requests,10);assert.notEqual(destinationFingerprint('assignment-0',points),destinationFingerprint('assignment-0',[...points].reverse()));
 assert.throws(()=>destinationFingerprint('assignment-0',[points[0],points[0]]));
 assert.notEqual(destinationFingerprint('assignment-0',points,'driver-a'),destinationFingerprint('assignment-0',points,'driver-b'));
});
test("ordinary receipt/photo reads never create or reconfigure Storage buckets",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {supabaseAdmin}=await import("../src/config/supabase.js"),{listTripImages}=await import("../src/services/trip-image.service.js");
 const original=supabaseAdmin.from,get=supabaseAdmin.storage.getBucket,create=supabaseAdmin.storage.createBucket,update=supabaseAdmin.storage.updateBucket;let mutations=0;
 supabaseAdmin.from=(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'fixture'},error:null})})})})) as typeof original;
 supabaseAdmin.storage.createBucket=(async()=>{mutations++;throw Error('No mutations allowed');}) as typeof create;
 supabaseAdmin.storage.updateBucket=(async()=>{mutations++;throw Error('No mutations allowed');}) as typeof update;
 try{
  supabaseAdmin.storage.getBucket=(async()=>({data:null,error:{message:'missing'}})) as typeof get;
  await assert.rejects(listTripImages('00000000-0000-4000-8000-000000000010'),/unavailable/);
  supabaseAdmin.storage.getBucket=(async()=>({data:{public:true},error:null})) as typeof get;
  await assert.rejects(listTripImages('00000000-0000-4000-8000-000000000010'),/must be private/);assert.equal(mutations,0);
 }finally{supabaseAdmin.from=original;supabaseAdmin.storage.getBucket=get;supabaseAdmin.storage.createBucket=create;supabaseAdmin.storage.updateBucket=update;}
});
