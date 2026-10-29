import {useEffect,useState} from 'react';
import {apiGetCached,type ApiResponse} from '../../services/api.service';
import type {TripReceipt} from '../../services/receipt.service';
import {podLabel,podSubmissions} from '../../services/pod-submissions';
import {snapshotOf} from '../../services/receipt-fields.service';
import DeliveryEvidenceGallery from './DeliveryEvidenceGallery';

export default function SubmittedPodDocuments({token,assignmentId,stopId,store,refreshKey}:{token:string|null;assignmentId:string;stopId:string;store:string;refreshKey:number}){
 const [rows,setRows]=useState<TripReceipt[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!token)return;let active=true;setRows([]);const endpoint=`/delivery/assignments/${encodeURIComponent(assignmentId)}/receipts`;void apiGetCached<ApiResponse<TripReceipt[]>>(`${endpoint}?view=${refreshKey}-${retry}`,token,1000,endpoint).then(result=>{if(!active)return;if(!result.success||!Array.isArray(result.data))throw Error(result.message||'Submitted PODs could not load.');setRows(result.data);setError('');}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[token,assignmentId,refreshKey,retry]);
 return <section aria-label={`Submitted PODs for ${store}`} className="delivery-submitted-pods">{error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}{podSubmissions(rows.filter(r=>r.trip_stop_id===stopId)).map(pages=>{const pod=pages[0],fields=snapshotOf(pod.ocr_text??'',pod.dr_number??'').fields;return <details key={pod.id}><summary>{podLabel(pod,{[stopId]:store})} · POD {pod.pod_review_status?.toLowerCase()||'pending'} · {pages.length} {pages.length===1?'photo':'photos'}</summary><dl><div><dt>Receiving store</dt><dd>{fields.receiver||store}</dd></div><div><dt>Submitted</dt><dd>{pod.uploaded_at?new Date(pod.uploaded_at).toLocaleString():'Not recorded'}</dd></div><div><dt>Approval status</dt><dd>{pod.pod_review_status||'PENDING'}</dd></div></dl>{pod.pod_rejection_reason&&<p>Rejection reason: {pod.pod_rejection_reason}</p>}<DeliveryEvidenceGallery files={pages.map(page=>({id:page.id,file_name:page.file_name||'POD photo',url:page.signed_url,mime_type:page.mime_type}))} onRetry={()=>setRetry(n=>n+1)} labelPrefix="Preview submitted POD"/></details>;})}</section>;
}
