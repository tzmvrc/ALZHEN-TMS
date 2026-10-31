import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline,finished} from 'node:stream/promises';
import {once} from 'node:events';
import {supabaseAdmin} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';
import {withSupabaseDeadline} from '../utils/supabase-request-scope.js';
import {currentGalleryImages} from './trip-gallery-eligibility.js';
import {nameTripImages,safeFilePart,type MediaRow,type MediaStop} from './trip-media-names.js';

const MAX_FILES=5000,MAX_BYTES=512*1024*1024,MAX_FILE_BYTES=25*1024*1024,TTL=15*60_000;
type Entry=ReturnType<typeof nameTripImages>[number];
type Job={id:string;tripId:string;actor:string;state:'PREPARING'|'READY'|'FAILED'|'CANCELLED';total:number;completed:number;bytes:number;failures:{id:string;filename:string;message:string}[];error?:string;filename:string;controller:AbortController;directory?:string;archive?:string;expiresAt:number;signature?:string;ticket?:{value:string;expires:number}};
const jobs=new Map<string,Job>();
const uuid=(value:string)=>{if(!isValidUuid(value))throw new ApiError('Invalid trip or image identifier.',400);};
const queryFailure=()=>new ApiError('Trip image metadata could not load. Retry the export.',503);

export async function tripMediaManifest(tripId:string,signal?:AbortSignal){
 uuid(tripId);signal?.throwIfAborted();
 const trip=await supabaseAdmin.from('trips').select('id,trip_reference').eq('id',tripId).abortSignal(signal??AbortSignal.timeout(30_000)).maybeSingle();
 if(trip.error)throw queryFailure();if(!trip.data)throw new ApiError('Trip not found.',404);
 const rows:MediaRow[]=[],stops:MediaStop[]=[];
 for(let start=0;;start+=200){
  signal?.throwIfAborted();
  const result=await supabaseAdmin.from('trip_images').select('id,trip_id,storage_path,file_name,mime_type,trip_stop_id,dr_number,created_at,delivery_event_id,kind,delivery_upload_state,assignment_id,pod_review_status,display_order,delivery_upload_key').eq('trip_id',tripId).order('created_at').order('id').range(start,start+199).abortSignal(signal??AbortSignal.timeout(30_000));
  if(result.error)throw queryFailure();const page=result.data??[];
  // Uncommitted offline uploads are not submitted trip evidence.
  rows.push(...page.filter(row=>row.delivery_upload_state!=='PENDING'&&['photo','receipt'].includes(row.kind)));
  if(rows.length>MAX_FILES)throw new ApiError('This trip exceeds the 5,000-file export limit. Contact your administrator for a larger archive.',413);
  if(page.length<200)break;
 }
 for(let start=0;;start+=200){
  signal?.throwIfAborted();
  const result=await supabaseAdmin.from('trip_stops').select('id,trip_id,dr_number,delivery_location,stop_sequence,store:customer_stores(name)').eq('trip_id',tripId).order('id').range(start,start+199).abortSignal(signal??AbortSignal.timeout(30_000));
  if(result.error)throw queryFailure();stops.push(...(result.data??[]) as unknown as MediaStop[]);if((result.data?.length??0)<200)break;
 }
 // Legacy operational photos may identify their stop through a saved event.
 const eventIds=[...new Set(rows.filter(row=>row.delivery_event_id).map(row=>row.delivery_event_id!))];
 for(let start=0;start<eventIds.length;start+=100){
  const result=await supabaseAdmin.from('trip_events').select('id,trip_stop_id,assignment_id,delivery_metadata').eq('trip_id',tripId).in('id',eventIds.slice(start,start+100)).abortSignal(signal??AbortSignal.timeout(30_000));
  if(result.error)throw queryFailure();const events=new Map((result.data??[]).map(row=>[row.id,row]));
  for(const row of rows){const event=events.get(row.delivery_event_id??'');if(!event)continue;if(!row.trip_stop_id)row.trip_stop_id=event.trip_stop_id;if(!row.assignment_id)row.assignment_id=event.assignment_id;if(event.assignment_id===row.assignment_id&&event.trip_stop_id===row.trip_stop_id)row.replaces_receipt_id=event.delivery_metadata?.replaces_receipt_id??null;else if(row.kind==='receipt')row.pod_review_status=null;}

 }
 return {filename:`Trip ${safeFilePart(trip.data.trip_reference||tripId)} - Photos & Records.zip`,entries:nameTripImages(currentGalleryImages(rows,tripId),stops,tripId),stops};
}

/** Server-only signed fetch. Neither Storage paths nor signed URLs enter job responses. */
async function storedImage(entry:Entry,signal:AbortSignal){
 const signed=await withSupabaseDeadline(15_000,async()=>await supabaseAdmin.storage.from('trip-images').createSignedUrl(entry.storage_path,120),signal);
 if(signed.error||!signed.data?.signedUrl)throw Error('The stored image is unavailable.');
 const response=await fetch(signed.data.signedUrl,{signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)]),redirect:'error'});
 if(!response.ok||!response.body)throw Error('The stored image could not be retrieved.');
 if(Number(response.headers.get('content-length'))>MAX_FILE_BYTES){await response.body.cancel();throw Error('The stored image exceeds the 25 MB per-file export limit.');}
 let bytes=0;
 const bounded=new Transform({transform(chunk,_encoding,next){bytes+=chunk.length;next(bytes>MAX_FILE_BYTES?Error('The stored image exceeds the 25 MB per-file export limit.'):null,chunk);}});
 return {body:Readable.fromWeb(response.body as any),bounded};
}
function publicJob(job:Job){return {id:job.id,state:job.state,total:job.total,completed:job.completed,bytes:job.bytes,failures:job.failures,error:job.error,filename:job.filename,expires_at:new Date(job.expiresAt).toISOString()};}
function ownedJob(id:string,tripId:string,actor:string){const job=jobs.get(id);if(!job||job.actor!==actor||job.tripId!==tripId||job.expiresAt<Date.now())throw new ApiError('This export expired or is unavailable. Start a new export.',404);return job;}
export function imageExportStatus(id:string,tripId:string,actor:string){return publicJob(ownedJob(id,tripId,actor));}
export function cancelImageExport(id:string,tripId:string,actor:string){const job=ownedJob(id,tripId,actor);job.controller.abort();job.state='CANCELLED';job.ticket=undefined;return publicJob(job);}

async function buildArchive(job:Job){
 let archive:import('archiver').ZipArchive|undefined,output:ReturnType<typeof createWriteStream>|undefined;
 const deadline=setTimeout(()=>job.controller.abort(),10*60_000);deadline.unref();
 try{
  const manifest=await tripMediaManifest(job.tripId,job.controller.signal);job.total=manifest.entries.length;job.filename=manifest.filename;job.signature=manifestSignature(manifest);
  if(!job.total)throw Error('This trip has no current approved POD images or operational photos to export.');
  job.directory=await mkdtemp(join(tmpdir(),'alzhen-trip-export-'));job.archive=join(job.directory,'images.zip');
  const {ZipArchive}=await import('archiver');archive=new ZipArchive({store:true});output=createWriteStream(job.archive);
  let archiveError:Error|undefined;archive.on('error',error=>{archiveError=error;output?.destroy(error);});archive.on('warning',error=>{archiveError=error;output?.destroy(error);});
  const done=finished(output);void done.catch(()=>{});output.on('error',error=>archive?.destroy(error));archive.pipe(output);
  for(const entry of manifest.entries){
   job.controller.signal.throwIfAborted();if(archiveError)throw archiveError;
   const temporary=join(job.directory,'current-image');
   try{
    const {body,bounded}=await storedImage(entry,job.controller.signal);
    await pipeline(body,bounded,createWriteStream(temporary),{signal:job.controller.signal});
    const size=(await stat(temporary)).size;if(job.bytes+size>MAX_BYTES)throw Error('The archive exceeds the 512 MB export limit.');
    const appended=once(archive,'entry',{signal:job.controller.signal});archive.file(temporary,{name:entry.archivePath,date:entry.created_at?new Date(entry.created_at):new Date(0)});await appended;
    job.bytes+=size;job.completed++;
   }catch(error){
    if(job.controller.signal.aborted)throw error;
    if(job.failures.length<20)job.failures.push({id:entry.id,filename:entry.filename,message:error instanceof Error&&/limit/.test(error.message)?error.message:'This image could not be downloaded. Refresh the gallery and retry.'});
    if(error instanceof Error&&/512 MB/.test(error.message))throw error;
   }finally{await rm(temporary,{force:true});}
  }
  if(job.failures.length)throw Error(`${job.total-job.completed} image(s) failed. No incomplete ZIP was offered. Retry the export after checking the listed files.`);
  await archive.finalize();await done;
  job.controller.signal.throwIfAborted();job.state='READY';job.expiresAt=Date.now()+TTL;
 }catch(error){job.state=job.controller.signal.aborted?'CANCELLED':'FAILED';job.error=job.controller.signal.aborted?'Export cancelled or its ten-minute deadline was reached. Start again when ready.':error instanceof ApiError?error.message:error instanceof Error&&(/limit|image\(s\) failed|no current approved/.test(error.message))?error.message:'The archive could not be prepared. No incomplete ZIP was offered. Retry the export.';archive?.abort();output?.destroy();}
 finally{clearTimeout(deadline);if(job.state!=='READY'&&job.directory)await rm(job.directory,{recursive:true,force:true}).catch(()=>{});const expiry=setTimeout(()=>{job.controller.abort();jobs.delete(job.id);if(job.directory)void rm(job.directory,{recursive:true,force:true}).catch(()=>{});},TTL);expiry.unref();}
}
export function startImageExport(tripId:string,actor:string){
 uuid(tripId);const existing=[...jobs.values()].find(job=>job.actor===actor&&job.tripId===tripId&&job.state==='PREPARING');if(existing)return publicJob(existing);
 if([...jobs.values()].filter(job=>job.state==='PREPARING').length>=2||[...jobs.values()].filter(job=>job.expiresAt>Date.now()).length>=8)throw new ApiError('Photo exports are busy. Retry after an existing export finishes or expires.',429);
 const job:Job={id:randomUUID(),tripId,actor,state:'PREPARING',total:0,completed:0,bytes:0,failures:[],filename:'Trip photos.zip',controller:new AbortController(),expiresAt:Date.now()+25*60_000};jobs.set(job.id,job);void buildArchive(job);return publicJob(job);
}
/** Short-lived, one-use capability for a browser-native download (no ZIP Blob in JS memory). */
function manifestSignature(manifest:Awaited<ReturnType<typeof tripMediaManifest>>){return JSON.stringify(manifest.entries.map(row=>[row.id,row.storage_path,row.filename,row.archivePath]).sort((a,b)=>a[0].localeCompare(b[0])));}
async function revalidateArchive(job:Job){
 const current=await tripMediaManifest(job.tripId);
 if(job.state!=='READY'||manifestSignature(current)!==job.signature){job.state='FAILED';job.ticket=undefined;job.error='Trip images changed. Export again to include only current approved PODs and operational photos.';throw new ApiError(job.error,409);}
}
export async function imageExportTicket(id:string,tripId:string,actor:string){const job=ownedJob(id,tripId,actor);if(job.state!=='READY')throw new ApiError('The archive is not ready.',409);await revalidateArchive(job);job.ticket={value:randomBytes(32).toString('hex'),expires:Date.now()+60_000};return {ticket:job.ticket.value};}
export async function consumeImageExport(id:string,tripId:string,ticket:unknown){const job=jobs.get(id);if(!job||job.tripId!==tripId||job.state!=='READY'||job.expiresAt<Date.now()||typeof ticket!=='string'||!job.ticket||job.ticket.expires<Date.now()||job.ticket.value!==ticket)throw new ApiError('This download link expired or was already used. Request the archive again.',403);job.ticket=undefined;await revalidateArchive(job);return {path:job.archive!,filename:job.filename};}
export async function tripGallery(tripId:string,query:Record<string,unknown>){
 const manifest=await tripMediaManifest(tripId),term=typeof query.search==='string'?query.search.trim().toLowerCase().slice(0,100):'';
 const limit=50,requested=Number(query.page),page=Number.isFinite(requested)?Math.max(1,Math.floor(requested)):1,stopById=new Map(manifest.stops.map(stop=>[stop.id,stop]));
 const filtered=manifest.entries.filter(row=>(!query.stop||row.trip_stop_id===query.stop)&&(!query.assignment||row.assignment_id===query.assignment)&&(!query.type||row.kind===query.type)&&`${row.dr_number||stopById.get(row.trip_stop_id??'')?.dr_number||''} ${row.file_name} ${stopById.get(row.trip_stop_id??'')?.store?.name??''} ${stopById.get(row.trip_stop_id??'')?.delivery_location??''}`.toLowerCase().includes(term));
 const selected=filtered.sort((a,b)=>Number(stopById.get(a.trip_stop_id??'')?.stop_sequence??Infinity)-Number(stopById.get(b.trip_stop_id??'')?.stop_sequence??Infinity)||(a.kind==='receipt'?0:1)-(b.kind==='receipt'?0:1)||(a.delivery_event_id??a.id).localeCompare(b.delivery_event_id??b.id)||(a.display_order??0)-(b.display_order??0)).slice((page-1)*limit,page*limit);
 const signed=selected.length?await withSupabaseDeadline(15000,async()=>await supabaseAdmin.storage.from('trip-images').createSignedUrls(selected.map(row=>row.storage_path),3600)):{data:[],error:null};
 const links=new Map((signed.data??[]).map(item=>[item.path,item.signedUrl]));
 const rows=selected.map(row=>{
  const stop=stopById.get(row.trip_stop_id??'');
  return {id:row.id,trip_id:tripId,trip_stop_id:row.trip_stop_id??null,assignment_id:row.assignment_id??null,kind:row.kind,dr_number:row.dr_number||stop?.dr_number||null,destination:stop?.store?.name||stop?.delivery_location||null,stop_sequence:stop?.stop_sequence??null,file_name:row.file_name,download_name:row.filename,mime_type:row.mime_type??null,created_at:row.created_at,display_order:row.display_order??0,delivery_event_id:row.delivery_event_id??null,pod_review_status:row.kind==='receipt'?'APPROVED':null,signed_url:links.get(row.storage_path)||null};
 });
 return {rows,total:filtered.length,page,totalPages:Math.ceil(filtered.length/limit)};
}
export async function downloadTripImage(tripId:string,imageId:string,signal:AbortSignal){uuid(imageId);const manifest=await tripMediaManifest(tripId,signal),entry=manifest.entries.find(row=>row.id===imageId);if(!entry)throw new ApiError('This image is not available in the current trip gallery.',404);return {...await storedImage(entry,signal),filename:entry.filename};}
