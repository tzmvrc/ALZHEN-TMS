import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {readFile,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {nameTripImages,safeFilePart,type MediaRow} from '../src/services/trip-media-names.js';
const trip='123e4567-e89b-42d3-a456-426614174000',other='223e4567-e89b-42d3-a456-426614174000',stop='323e4567-e89b-42d3-a456-426614174000';
test('persisted image naming, mixed extensions, collision suffixes and metadata fallbacks',()=>{
 const rows=[1,2,3].map((id)=>({id:String(id),trip_id:trip,trip_stop_id:stop,storage_path:`x/${id}`,file_name:id===3?'photo.png':'photo.jpg',mime_type:id===3?'image/png':'image/jpeg',dr_number:'24234242'}));
 const result=nameTripImages([...rows,{...rows[0],id:'foreign',trip_id:other},rows[0]], [{id:stop,trip_id:trip,store:{name:'DESMARK CORP'},stop_sequence:2}],trip);
 assert.deepEqual(result.map(row=>row.filename),['24234242 - DESMARK CORP - 01.jpg','24234242 - DESMARK CORP - 02.jpg','24234242 - DESMARK CORP - 03.png']);
 assert.ok(result.every(row=>row.archivePath.startsWith('Stop 2 - DESMARK CORP/DR 24234242/')));
 assert.equal(safeFilePart('../CON:*?'), '.. CON');assert.equal(safeFilePart('CON'), '_CON');assert.equal(safeFilePart('...'),'Record');
 const fallback=nameTripImages([{...rows[0],trip_stop_id:null,dr_number:null,file_name:'unrelated:name.png',mime_type:'image/png'}],[],trip)[0];assert.equal(fallback.filename,'unrelated name - 1.png');assert.ok(!fallback.filename.includes('24234242'));
 assert.equal(nameTripImages([{...rows[0],mime_type:'application/pdf',file_name:'receipt.pdf'}],[],trip).length,0);
 assert.match(nameTripImages([{...rows[0],file_name:'wrong.png',mime_type:'image/jpeg'}],[],trip)[0].filename,/\.jpg$/,'Stored image type corrects a misleading source extension');
});

function zipEntries(bytes:Buffer){
 let end=bytes.length-22;while(end>=0&&bytes.readUInt32LE(end)!==0x06054b50)end--;assert.ok(end>=0,'Valid ZIP end directory');
 let offset=bytes.readUInt32LE(end+16);const count=bytes.readUInt16LE(end+10),entries:{name:string;body:Buffer}[]=[];
 for(let index=0;index<count;index++){assert.equal(bytes.readUInt32LE(offset),0x02014b50);const length=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),size=bytes.readUInt32LE(offset+20),local=bytes.readUInt32LE(offset+42),name=bytes.toString('utf8',offset+46,offset+46+length),start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);entries.push({name,body:bytes.subarray(start,start+size)});offset+=46+length+extra+comment;}
 return entries;
}
test('paginated server ZIP preserves original bytes, current approved/replacement photos and trip isolation; failures and capabilities are bounded',async()=>{
 process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated';process.env.SUPABASE_ANON_KEY='isolated';
 const {supabaseAdmin,supabaseAuth}=await import('../src/config/supabase.js'),service=await import('../src/services/trip-media-export.service.js');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+a0AAAAASUVORK5CYII=','base64');
 let fail=false,fetches=0;
 const server=createServer((req,res)=>{fetches++;if(fail){res.writeHead(404).end();return;}res.setHeader('Content-Type','image/png');res.end(png);});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address() as {port:number},originalFrom=supabaseAdmin.from,originalSigned=supabaseAdmin.storage.from,originalUser=supabaseAuth.auth.getUser,originalRpc=supabaseAdmin.rpc;
 const accounts=['ADMIN','STAFF','TRUCKER'].map((role,index)=>({id:`${index+5}23e4567-e89b-42d3-a456-426614174000`,role,session:String(index).repeat(43)}));
 const rows:MediaRow[]=Array.from({length:221},(_,index)=>({id:`${String(index+1).padStart(8,'0')}-1111-4111-8111-111111111111`,trip_id:trip,trip_stop_id:stop,storage_path:`trips/${trip}/${index}.png`,file_name:'source.png',mime_type:'image/png',dr_number:'SAME-DR',kind:index%2?'receipt':'photo',pod_review_status:index%2?'APPROVED':null,delivery_upload_state:'READY',created_at:'2026-10-30T01:00:00Z'}));
 const extraId=(n:number)=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
 const original={...rows[1],id:extraId(800),assignment_id:'assignment',delivery_event_id:extraId(900),storage_path:'superseded.jpg'};
 const replacement={...original,id:extraId(801),delivery_event_id:extraId(901),storage_path:'replacement-01.png'};
 rows.push(original,replacement,{...replacement,id:extraId(802),storage_path:'replacement-02.png',display_order:1});
 const fixtureEvents=[{id:extraId(900),trip_id:trip,trip_stop_id:stop,assignment_id:'assignment',delivery_metadata:{}},{id:extraId(901),trip_id:trip,trip_stop_id:stop,assignment_id:'assignment',delivery_metadata:{replaces_receipt_id:original.id}}];
 rows.push({...rows[1],id:extraId(850),pod_review_status:'REJECTED',storage_path:'rejected.png'},{...rows[1],id:extraId(851),pod_review_status:'PENDING',storage_path:'pending.png'},{...rows[0],id:'foreign',trip_id:other},{...rows[0],id:'uncommitted',delivery_upload_state:'PENDING'});
 const reads:{table:string;from:number;filters:[string,unknown][]}[]=[];
 (supabaseAdmin as any).from=(table:string)=>{let from=0,to=999,filters:[string,unknown][]=[];const chain:any={select:()=>chain,insert:()=>chain,update:()=>chain,eq:(key:string,value:unknown)=>{filters.push([key,value]);return chain;},order:()=>chain,range:(a:number,b:number)=>{from=a;to=b;return chain;},abortSignal:()=>chain,maybeSingle:()=>chain,in:()=>chain,then:(resolve:any)=>{reads.push({table,from,filters});let data:any[]=table==='profiles'?accounts:table==='admin_staff_session_days'||table==='trucker_active_sessions'?accounts.map(account=>({profile_id:account.id,role:account.role,expires_at:new Date(Date.now()+86400000).toISOString(),session_hash:createHash('sha256').update(account.session).digest('hex')})):table==='trips'?[{id:trip,trip_reference:'TEST-TRIP'}]:table==='trip_stops'?[{id:stop,trip_id:trip,dr_number:'STOP-DR',store:{name:'Persisted Store'},stop_sequence:2}]:table==='trip_images'?rows:table==='trip_events'?fixtureEvents:[];data=data.filter(row=>filters.every(([key,value])=>row[key]===value));return Promise.resolve({data:['trips','profiles','admin_staff_session_days','trucker_active_sessions'].includes(table)?data[0]??null:data.slice(from,to+1),error:null}).then(resolve);}};return chain;};
 (supabaseAuth.auth as any).getUser=async(token:string)=>({data:{user:accounts.find(account=>account.role===token)??null},error:null});
 (supabaseAdmin as any).rpc=async()=>({data:'ACTIVE',error:null});
 (supabaseAdmin.storage as any).from=()=>({createSignedUrls:async(paths:string[])=>({data:paths.map(path=>({path,signedUrl:`http://127.0.0.1:${address.port}/image`})),error:null}),createSignedUrl:async()=>({data:{signedUrl:`http://127.0.0.1:${address.port}/image`},error:null})});
 const archiveDirectories=new Set<string>();let apiServer:ReturnType<typeof createServer>|undefined;
 async function finish(id:string){for(let attempt=0;attempt<600;attempt++){const state=service.imageExportStatus(id,trip,'actor');if(state.state!=='PREPARING')return state;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Fixture archive did not finish');}
 try{
  const job=service.startImageExport(trip,'actor');assert.equal(service.startImageExport(trip,'actor').id,job.id,'Concurrent request reuses job');
  const ready=await finish(job.id);assert.equal(ready.state,'READY');assert.equal(ready.completed,223);assert.equal(ready.filename,'Trip TEST-TRIP - Photos & Records.zip');
  assert.ok(reads.some(read=>read.table==='trip_images'&&read.from===200));assert.ok(reads.every(read=>read.filters.some(([key,value])=>(key==='trip_id'||key==='id')&&value===trip)));
  assert.throws(()=>service.imageExportStatus(job.id,trip,'another-account'),/unavailable/);
  const {ticket}=await service.imageExportTicket(job.id,trip,'actor');await assert.rejects(service.consumeImageExport(job.id,other,ticket),/expired/);
  const archive=await service.consumeImageExport(job.id,trip,ticket);archiveDirectories.add(dirname(archive.path));await assert.rejects(service.consumeImageExport(job.id,trip,ticket),/already used/);
  const entries=zipEntries(await readFile(archive.path));assert.equal(entries.length,223);assert.equal(new Set(entries.map(entry=>entry.name)).size,223);assert.ok(entries.every(entry=>entry.name.includes('SAME-DR - Persisted Store')&&entry.body.equals(png)));assert.equal(fetches,223);const gallery=await service.tripGallery(trip,{});assert.equal(gallery.total,223);assert.equal(gallery.rows.length,50);assert.ok(gallery.rows.every(row=>row.kind!=='receipt'||row.pod_review_status==='APPROVED'));const manifest=await service.tripMediaManifest(trip);assert.ok(!manifest.entries.some(row=>[original.id,extraId(850),extraId(851)].includes(row.id)));assert.ok(manifest.entries.some(row=>row.id===replacement.id));assert.equal(rows.find(row=>row.id===original.id)!.pod_review_status,'APPROVED','Historical approval remains stored');
  const single=await service.downloadTripImage(trip,rows[0].id,new AbortController().signal);assert.equal(single.filename,'SAME-DR - Persisted Store - 01.png');const chunks:Buffer[]=[];for await(const chunk of single.body.pipe(single.bounded))chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),png);
  await assert.rejects(service.downloadTripImage(trip,other,new AbortController().signal),/Invalid|current trip gallery/);
  await assert.rejects(service.downloadTripImage(trip,extraId(850),new AbortController().signal),/current trip gallery/);const staleTicket=await service.imageExportTicket(job.id,trip,'actor');rows[1].pod_review_status='REJECTED';await assert.rejects(service.consumeImageExport(job.id,trip,staleTicket.ticket),/images changed/);
  fail=true;rows.splice(1,rows.length-1);const broken=service.startImageExport(trip,'actor');const failed=await finish(broken.id);assert.equal(failed.state,'FAILED');assert.equal(failed.failures.length,1);assert.match(failed.error!,/No incomplete ZIP/);await assert.rejects(service.imageExportTicket(broken.id,trip,'actor'),/not ready/);
  const cancelled=service.startImageExport(trip,'actor');service.cancelImageExport(cancelled.id,trip,'actor');assert.equal((await finish(cancelled.id)).state,'CANCELLED');
  await new Promise(resolve=>setTimeout(resolve,10));fail=false;
  const {default:express}=await import('express'),{default:router}=await import('../src/routes/trip.routes.js');
  const app=express();app.use(express.json());app.use('/api/trips',router);app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({success:false,message:error.message}));apiServer=app.listen(0,'127.0.0.1');await onceListening(apiServer);
  const api=`http://127.0.0.1:${(apiServer.address() as {port:number}).port}/api/trips/${trip}`;
  assert.equal((await fetch(`${api}/image-exports`,{method:'POST'})).status,401);assert.equal((await fetch(`${api}/media`)).status,401);
  const headers=(role:string)=>({Authorization:`Bearer ${role}`,'X-App-Session':accounts.find(account=>account.role===role)!.session});
  assert.equal((await fetch(`${api}/image-exports`,{method:'POST',headers:headers('TRUCKER')})).status,403);
  assert.equal((await fetch(`${api}/media`,{headers:headers('TRUCKER')})).status,403);const allowedGallery=await fetch(`${api}/media`,{headers:headers('STAFF')});assert.equal(allowedGallery.status,200);assert.equal((await allowedGallery.json()).data.rows.length,1);
  const started=await fetch(`${api}/image-exports`,{method:'POST',headers:headers('ADMIN')});assert.equal(started.status,202);const adminJob=(await started.json()).data;
  let confirmed:any;for(let n=0;n<100;n++){confirmed=(await (await fetch(`${api}/image-exports/${adminJob.id}`,{headers:headers('ADMIN')})).json()).data;if(confirmed.state!=='PREPARING')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(confirmed.state,'READY');
  assert.equal((await fetch(`${api}/image-exports/${adminJob.id}`,{headers:headers('STAFF')})).status,404,'Another account cannot read the job');
  const downloadToken=(await (await fetch(`${api}/image-exports/${adminJob.id}/ticket`,{method:'POST',headers:headers('ADMIN')})).json()).data.ticket;
  const native=await fetch(`${api}/image-exports/${adminJob.id}/archive?ticket=${downloadToken}`);assert.equal(native.status,200);assert.match(native.headers.get('content-disposition')! ,/Photos.*Records/);assert.equal(zipEntries(Buffer.from(await native.arrayBuffer())).length,1);assert.equal((await fetch(`${api}/image-exports/${adminJob.id}/archive?ticket=${downloadToken}`)).status,403);
  const singleResponse=await fetch(`${api}/media/${rows[0].id}/download`,{headers:headers('STAFF')});assert.equal(singleResponse.status,200);assert.match(singleResponse.headers.get('content-disposition')!,/SAME-DR - Persisted Store.png/);assert.match(singleResponse.headers.get('access-control-expose-headers')!,/Content-Disposition/);assert.deepEqual(Buffer.from(await singleResponse.arrayBuffer()),png);
  const retained=await service.consumeImageExport(adminJob.id,trip,(await service.imageExportTicket(adminJob.id,trip,accounts[0].id)).ticket);archiveDirectories.add(dirname(retained.path));rows[0].storage_path='changed-image.png';await assert.rejects(service.imageExportTicket(adminJob.id,trip,accounts[0].id),/images changed/);assert.equal(service.imageExportStatus(adminJob.id,trip,accounts[0].id).state,'FAILED');
 }finally{if(apiServer)await new Promise<void>(resolve=>apiServer!.close(()=>resolve()));supabaseAdmin.from=originalFrom;supabaseAdmin.storage.from=originalSigned;supabaseAuth.auth.getUser=originalUser;supabaseAdmin.rpc=originalRpc;await new Promise<void>(resolve=>server.close(()=>resolve()));for(const directory of archiveDirectories)await rm(directory,{recursive:true,force:true});}
});
async function onceListening(server:ReturnType<typeof createServer>){if(server.listening)return;await new Promise<void>(resolve=>server.once('listening',resolve));}
