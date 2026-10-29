import {useEffect,useState} from 'react';
import {subscribeCollaborationEvents} from '../../services/collaboration.service';
import {invalidateApiCache} from '../../services/api.service';
import {useAuth} from '../../context/AuthContext';
import {fetchOperationsReceipts,type OperationsReceipt,type OperationsReportData} from '../../services/operations-report.service';
import {ArrowLeft} from 'lucide-react';
import {DeliveryEventEntry} from '../delivery/DeliveryTimeline';
import DeliveryEvidenceGallery,{type EvidencePreview} from '../delivery/DeliveryEvidenceGallery';
import {milestoneIcon} from '../../services/operational-timeline-icons';
import {incidentPresentation,isOperationalReport,type OperationalMilestone} from '../../services/operational-timeline';
import {phTime,deliveryActorLabel,readDeliveryEventDetails,verificationLabel,type EventDetails} from '../../services/delivery.service';
import {cleanActivityNote} from '../../services/activity-presentation';

export default function TripOperationalInspector({milestone,assignmentId,plate,driver,onBack,onReviewed,onOpenReport,operations}:{milestone:OperationalMilestone;assignmentId:string;plate:string;driver:string;onBack:()=>void;onReviewed:()=>void;onOpenReport:(kind:'operations'|'receipts')=>void;operations:OperationsReportData|null}){
 const {accessToken,profile}=useAuth();
 const fileKey=[...milestone.files.map(file=>file.id),...(milestone.event?.attachments.map(file=>file.id)??[])].sort().join(',');
 const [receipts,setReceipts]=useState<OperationsReceipt[]|null>(null),[eventDetails,setEventDetails]=useState<EventDetails|null>(null),[imageError,setImageError]=useState(''),[imageRetry,setImageRetry]=useState(0),[reviewOpen,setReviewOpen]=useState(false);
 const event=milestone.event,hasEventImages=Boolean(event?.attachments.length);
 useEffect(()=>{if(!event)return;let timer:ReturnType<typeof setTimeout>|undefined;
  const off=subscribeCollaborationEvents(update=>{if(update.kind==='commit'&&update.commit.source==='trip_images'&&update.commit.tripId===event.trip_id||update.kind==='signal'&&update.topic==='trip_images'){clearTimeout(timer);timer=setTimeout(()=>setImageRetry(n=>n+1),300);}});
  return()=>{clearTimeout(timer);off();};
 },[event?.id,event?.trip_id]);
 useEffect(()=>{if(!accessToken)return;let active=true;setImageError('');
  if(event&&hasEventImages){if(imageRetry)invalidateApiCache(`/delivery/assignments/${assignmentId}/events/${event.id}`);void readDeliveryEventDetails(accessToken,assignmentId,event.id,event.delivery_version).then(data=>{if(active)setEventDetails(data);},()=>{if(active)setImageError('Images could not load.');});}
  if(milestone.reportId&&milestone.reportType&&milestone.files.length&&operations?.evidence_links_pending){setReceipts(null);if(imageRetry)invalidateApiCache(`/reports/operations/${milestone.reportType.toLowerCase()}/${milestone.reportId}/receipts`);void fetchOperationsReceipts(accessToken,milestone.reportType,milestone.reportId,imageRetry?0:60000).then(rows=>{if(active)setReceipts(rows);},()=>{if(active)setImageError('Images could not load.');});}
  return()=>{active=false;};
 },[accessToken,assignmentId,event?.id,event?.delivery_version,hasEventImages,milestone.reportId,milestone.reportType,operations?.evidence_links_pending,fileKey,imageRetry]);
 const eventFiles:EvidencePreview[]=event?(eventDetails?.attachments??event.attachments).map(file=>({...file,url:file.url??null})):[];
 const reportFiles:EvidencePreview[]=receipts?receipts.filter(receipt=>milestone.files.some(file=>file.id===receipt.id)).map(file=>({id:file.id,file_name:file.file_name,url:file.signed_url,mime_type:file.mime_type})):milestone.files.map(file=>({id:file.id,file_name:file.file_name,url:file.signed_url,mime_type:file.mime_type}));
 const files=[...new Map([...eventFiles,...reportFiles].map(file=>[file.id,file])).values()];
 const id=milestone.reportId??event?.delivery_metadata.report_id;
 const report=milestone.report??[...(operations?.backloads??[]),...(operations?.offloads??[])].find(row=>row.id===id);
 const reportItems=operations?.event_rows.flatMap(row=>[...row.backload_records,...row.offload_records]).find(row=>row.id===id)?.items??[];
 const incident=isOperationalReport(milestone),presentation=incidentPresentation(milestone);
 const Icon=milestoneIcon(incident&&presentation.tone!=='incident'?presentation.tone.toUpperCase():milestone.type),shared=milestone.scope==='trip-wide';
 const remarks=cleanActivityNote(milestone.remarks||report?.comments||'');
 const loading=hasEventImages&&!eventDetails&&!event?.attachments.every(file=>file.url)||Boolean(operations?.evidence_links_pending&&milestone.files.length&&!receipts);
 return <section className="trip-event-inspector trip-event-simple" data-category={incident?presentation.tone:undefined} aria-label="Selected milestone details"><header><h2>{incident?'Report Details':'Event Details'}</h2><button type="button" onClick={onBack}><ArrowLeft size={15} aria-hidden="true"/>Back to route</button></header>{event&&<p className="trip-muted">{event.event_type==='POD_SUBMITTED'?'Submitted by':'Updated by'}: {deliveryActorLabel(event)}</p>}
 <div className="trip-event-hero"><Icon className="trip-event-watermark" aria-hidden="true"/><span className="trip-event-symbol"><Icon size={23} aria-hidden="true"/></span><div><h3>{incident?presentation.label:milestone.title}</h3><time>{milestone.time?phTime(milestone.time):'None'}</time></div></div>
 <dl className="trip-event-info">{incident&&<><div><dt>Report type</dt><dd>{presentation.label}</dd></div><div><dt>Status</dt><dd>{presentation.status||'None'}</dd></div><div><dt>Scope</dt><dd>{shared?'Trip-wide report':'Truck-specific report'}</dd></div></>}<div><dt>Truck</dt><dd>{shared?'None':plate||'None'}</dd></div><div><dt>Driver</dt><dd>{shared?'None':driver||'None'}</dd></div><div><dt>{incident?'Stop':'Location'}</dt><dd>{incident&&!milestone.stopId?'None':milestone.location||'None'}</dd></div>{event?.verification_method&&event.verification_method!=='NONE'&&<div><dt>Verification</dt><dd>{verificationLabel(event.verification_method)}</dd></div>}{event?.demonstration&&<div><dt>Source</dt><dd><span className="trip-demo-tag">Demo</span></dd></div>}</dl>
 {report&&!incident&&<dl className="trip-report-facts"><div><dt>Report type</dt><dd>{milestone.reportType??event?.delivery_metadata.report_type??'Operational report'}</dd></div>{report.reason&&<div><dt>Reason</dt><dd>{cleanActivityNote(report.reason)}</dd></div>}{report.number_of_boxes!=null&&<div><dt>Boxes</dt><dd>{report.number_of_boxes}</dd></div>}</dl>}
 {incident&&<section className="trip-event-section"><h4>Reason</h4><p>{presentation.reason?cleanActivityNote(presentation.reason):'None'}</p></section>}
 {event?.delivery_metadata.pod_review_event_id&&<section className="trip-event-section"><h4>Admin POD review</h4><p>{event.actor?.first_name} &middot; DR {event.delivery_metadata.dr_number}</p><button type="button" className="delivery-inline" onClick={()=>window.dispatchEvent(new CustomEvent('open-pod-review',{detail:{receiptId:event.delivery_metadata.receipt_id}}))}>View POD submission</button></section>}
 <section className="trip-event-section"><h4>Remarks</h4><p>{remarks||'None'}</p></section>
 <section className="trip-event-section"><h4>Images</h4>{imageError?<p role="status">{imageError} <button type="button" className="delivery-inline" onClick={()=>setImageRetry(n=>n+1)}>Retry</button></p>:loading?<p role="status">Loading images...</p>:files.length?<DeliveryEvidenceGallery files={files} onRetry={()=>setImageRetry(n=>n+1)}/>:<p>None</p>}</section>
 {incident&&(presentation.tone==='backload'||presentation.tone==='offload'||presentation.drNumber||reportItems.length>0)&&<section className="trip-event-section"><h4>Affected cargo / DR</h4>{presentation.drNumber&&<p>{presentation.drNumber}</p>}{report?.number_of_boxes!=null&&<p>{report.number_of_boxes} boxes</p>}{!reportItems.length&&!presentation.drNumber&&report?.number_of_boxes==null&&<p>None</p>}</section>}
 {reportItems.length>0&&<div className="trip-cargo-scroll"><table><thead><tr><th>Product / DR</th><th>Quantity</th><th>CBM</th></tr></thead><tbody>{reportItems.map(item=><tr key={item.id}><td>{item.customer_model||item.dr_number||'Cargo item'}{item.customer_model&&item.dr_number&&<small className="block">{item.dr_number}</small>}</td><td>{item.quantity??'None'}</td><td>{item.total_cbm??'None'}</td></tr>)}</tbody></table></div>}
 {event&&event.event_type!=='POD_SUBMITTED'&&event.delivery_metadata.report_id&&<button type="button" className="delivery-inline" onClick={()=>onOpenReport(event.event_type==='POD_SUBMITTED'?'receipts':'operations')}>Open {event.event_type==='POD_SUBMITTED'?'POD review':'saved report'}</button>}
 {event?.assignment_id&&profile?.role==='ADMIN'&&!event?.delivery_metadata?.pod_review_event_id&&<details className="trip-record-review" onToggle={e=>setReviewOpen(e.currentTarget.open)}><summary>Review & corrections</summary>{reviewOpen&&<ul className="trip-inspector-event"><DeliveryEventEntry reviewOnly standalone showEvidence={false} event={event} assignmentId={assignmentId} onReviewed={onReviewed}/></ul>}</details>}
 </section>;
}
