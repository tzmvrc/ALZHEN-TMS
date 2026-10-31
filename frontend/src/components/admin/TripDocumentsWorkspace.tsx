import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,Search,LoaderCircle} from 'lucide-react';
import {subscribeCollaborationEvents} from '../../services/collaboration.service';
import type {TripAssignmentRecord} from '../../services/trip.service';
import TripWorkspaceDialog from './TripWorkspaceDialog';
import {fetchTripGallery,startTripImageExport,tripImageExportStatus,cancelTripImageExport,downloadTripArchive,downloadTripMedia,type ImageExport,type GalleryPage,type GalleryImage} from '../../services/trip-media-export.service';
import ImagePreview,{type PreviewFile} from '../ui/ImagePreview';

export default function TripDocumentsWorkspace({token,tripId,tripReference,dispatchNumber,onClose,assignments}:{token:string;tripId:string;tripReference:string;dispatchNumber:string;onClose:()=>void;assignments:TripAssignmentRecord[]}){
 const [exportJob,setExportJob]=useState<ImageExport|null>(null),[exportBusy,setExportBusy]=useState(false),[exportError,setExportError]=useState(''),[downloadBusy,setDownloadBusy]=useState<string|null>(null);
 const starting=useRef(false),downloaded=useRef(new Set<string>()),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const receive=async(job:ImageExport)=>{
  setExportJob(job);
  if(job.state==='PREPARING')return;
  setExportBusy(false);
  if(job.state!=='READY'){setExportError(job.error||'Export was cancelled. You can start it again.');return;}
  if(!downloaded.current.has(job.id)){downloaded.current.add(job.id);try{await downloadTripArchive(token,tripId,job.id);}catch(error){downloaded.current.delete(job.id);setExportError(error instanceof Error?error.message:'The archive download could not start. Try again.');}}
 };
 const exportAll=async()=>{if(starting.current)return;starting.current=true;setExportError('');setExportBusy(true);try{const job=await startTripImageExport(token,tripId);if(mounted.current)await receive(job);else void cancelTripImageExport(token,tripId,job.id).catch(()=>{});}catch(error){if(!mounted.current)return;if(exportJob?.state==='READY')setExportJob(null);setExportBusy(false);setExportError(error instanceof Error?error.message:'Export could not start. Retry when connected.');}finally{starting.current=false;}};
 useEffect(()=>{if(!exportJob||exportJob.state!=='PREPARING'||!exportBusy)return;let active=true,timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const next=await tripImageExportStatus(token,tripId,exportJob.id);if(!active)return;await receive(next);if(next.state==='PREPARING')timer=setTimeout(poll,1000);}catch(error){if(active){setExportBusy(false);setExportError(error instanceof Error?error.message:'Progress could not refresh. Retry to reconnect to the same export.');}}};timer=setTimeout(poll,750);return()=>{active=false;clearTimeout(timer);};},[exportJob?.id,exportJob?.state,exportBusy,token,tripId]);
 const cancelExport=async()=>{if(!exportJob)return;try{await receive(await cancelTripImageExport(token,tripId,exportJob.id));}catch(error){setExportError(error instanceof Error?error.message:'Cancellation could not be confirmed. Retry.');}finally{setExportBusy(false);}};

 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[preview,setPreview]=useState<PreviewFile|null>(null);
 const scope=`${token}:${tripId}:${page}:${query}`;
 const [snapshot,setSnapshot]=useState<{scope:string;data:GalleryPage}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},250);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{
  let live=true,inFlight=false,again=false,timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{if(inFlight){again=true;return;}inFlight=true;setBusy(true);try{const data=await fetchTripGallery(token,tripId,page,query);if(live){if(page>1&&page>data.totalPages){setPage(Math.max(1,data.totalPages));return;}setSnapshot({scope,data});setError('');}}catch{if(live)setError('Images could not refresh. Please retry to renew secure previews.');}finally{inFlight=false;if(live){setBusy(false);if(again){again=false;void load();}}}};
  void load();
  const off=subscribeCollaborationEvents(event=>{if(event.kind==='commit'&&event.commit.tripId===tripId&&['trip_images','trip_events','pod_review_events','pod_records'].includes(event.commit.source)){clearTimeout(timer);timer=setTimeout(()=>void load(),150);}});
  return()=>{live=false;clearTimeout(timer);off();};
 },[token,tripId,scope,page,query,revision]);
 const data=snapshot?.scope===scope?snapshot.data:null;
 const groups=new Map<string,GalleryImage[]>();
 for(const row of data?.rows??[]){const key=JSON.stringify([row.trip_stop_id,row.assignment_id,row.kind]);groups.set(key,[...(groups.get(key)??[]),row]);}
 const download=async(row:GalleryImage)=>{if(downloadBusy)return;setDownloadBusy(row.id);setError('');try{await downloadTripMedia(token,tripId,row.id);}catch(failure){setError(failure instanceof Error?failure.message:'Download failed. Refresh images and retry.');}finally{setDownloadBusy(null);}};
 return <TripWorkspaceDialog title="Photos & records" className="trip-gallery-dialog" dispatchNumber={dispatchNumber} tripReference={tripReference} onClose={()=>{if(exportBusy&&!window.confirm('Close this gallery? The export will stop.'))return;if(exportBusy)void cancelExport();onClose();}} actions={<button className="trip-gallery-export" type="button" disabled={exportBusy} onClick={()=>void exportAll()}>{exportBusy?<LoaderCircle size={16} className="animate-spin" aria-hidden/>:<Download size={16} aria-hidden/>}<span>{exportBusy?'Preparing ZIP...':'Export All Images'}</span></button>}>
  <section aria-label="Trip documents" className="trip-gallery-workspace">
   {(exportBusy||exportJob?.state==='READY'||exportError)&&<div className="trip-gallery-export-status" role="status">{exportBusy&&<><span>{exportJob?.total?`${exportJob.completed} of ${exportJob.total} images prepared`:'Reading eligible trip images...'}</span><progress aria-label="Image export progress" max={exportJob?.total||1} value={exportJob?.completed||0}/><button type="button" disabled={!exportJob} onClick={()=>void cancelExport()}>Cancel export</button></>}{!exportBusy&&exportJob?.state==='READY'&&!exportError&&<><span>Complete ZIP ready. Download started through your browser.</span><button type="button" onClick={()=>void downloadTripArchive(token,tripId,exportJob.id).catch(failure=>setExportError(failure instanceof Error?failure.message:'Download could not start. Export again.'))}>Download ZIP again</button></>}{exportError&&<p role="alert">{exportError}</p>}{exportJob?.failures.map(failure=><p key={failure.id}>{failure.filename}: {failure.message}</p>)}</div>}
   <div className="trip-gallery-tools"><label><Search size={16} aria-hidden/><input type="search" aria-label="Search trip documents" maxLength={100} placeholder="Search DR, destination or filename" value={search} onChange={event=>setSearch(event.target.value)}/></label><button type="button" disabled={busy} aria-label="Refresh images" onClick={()=>setRevision(value=>value+1)}><RefreshCw size={16} aria-hidden/></button></div>
   <p className="trip-gallery-count" role="status">{busy?'Refreshing images...':data?`${data.total} images`:''}</p>
   {error&&<p className="trip-gallery-error" role="alert">{error}</p>}
   {!busy&&data&&!data.rows.length&&<p className="trip-gallery-empty">No current approved PODs or operational photos{query?' match your search':' for this trip'}.</p>}
   {[...groups.values()].map(group=>{const first=group[0],assignment=assignments.find(assignment=>assignment.id===first.assignment_id);return <section className="trip-gallery-group" key={JSON.stringify([first.trip_stop_id,first.assignment_id,first.kind])}><h3>{first.stop_sequence?`${first.stop_sequence}. `:''}{first.destination||'Trip records'}<span>{assignment?.truck?.plate_number?`${String(assignment.truck.plate_number)} - `:''}{first.kind==='receipt'?'Approved PODs':'Operational photos'}</span></h3><div role="list">{group.map(row=><article className="trip-gallery-image" role="listitem" key={row.id}><button type="button" className="trip-gallery-thumbnail" disabled={!row.signed_url} aria-label={`Preview ${row.file_name}`} onClick={()=>setPreview({id:row.id,file_name:row.file_name,url:row.signed_url,mime_type:row.mime_type})}><img src={row.signed_url??undefined} alt={row.file_name} loading="lazy" decoding="async"/></button><div className="trip-gallery-image-info"><strong>{row.dr_number?`DR ${row.dr_number}`:row.file_name}</strong><p title={row.destination??undefined}>{row.destination||'Destination not recorded'} &middot; {row.kind==='receipt'?'POD Approved':'Operational photo'}</p><small title={row.file_name}>{row.file_name} &middot; {(row.mime_type?.split('/')[1]||row.file_name.split('.').at(-1)||'Image').toUpperCase()}</small></div><button type="button" className="trip-gallery-download" disabled={downloadBusy!==null} aria-label={`Download ${row.file_name}`} onClick={()=>void download(row)}>{downloadBusy===row.id?<LoaderCircle size={17} className="animate-spin" aria-hidden/>:<Download size={17} aria-hidden/>}<span>{downloadBusy===row.id?'Downloading...':'Download'}</span></button></article>)}</div></section>})}
   {data&&data.totalPages>1&&<nav className="trip-gallery-pagination" aria-label="Image pages"><button type="button" disabled={busy||page<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span>{page} / {data.totalPages}</span><button type="button" disabled={busy||page>=data.totalPages} onClick={()=>setPage(value=>value+1)}>Next</button></nav>}
  </section>
  {preview&&<ImagePreview file={preview} onClose={()=>setPreview(null)}/>}
 </TripWorkspaceDialog>;
}
