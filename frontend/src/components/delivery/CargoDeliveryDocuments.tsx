import {useEffect,useId,useState} from 'react';
import {ChevronDown,Package} from 'lucide-react';
import {apiGetCached,type ApiResponse} from '../../services/api.service';
import {nextDeliveryDestination,type DeliveryWorkspace} from '../../services/delivery.service';
import type {TripReceipt} from '../../services/receipt.service';
import {truckerCargoRows} from '../../services/trucker-cargo-list';
import {podSubmissions} from '../../services/pod-submissions';
import SubmittedPodDocuments from './SubmittedPodDocuments';

export default function CargoDeliveryDocuments({token,workspace,refreshKey}:{token:string|null;workspace:DeliveryWorkspace;refreshKey:number}){
 const {id:assignmentId,trip_id:tripId}=workspace.assignment;
 const scope=`${token}:${assignmentId}:${tripId}`;
 const panelId=useId(),expansionScope=`${assignmentId}:${tripId}`;
 const defaultStopId=nextDeliveryDestination(workspace)?.id;
 const stopIds=JSON.stringify(workspace.stops.map(stop=>stop.id));
 const defaultExpansion=Object.fromEntries(workspace.stops.map(stop=>[stop.id,stop.id===defaultStopId]));
 const [expansion,setExpansion]=useState(()=>({scope:expansionScope,initialized:workspace.stops.length>0,stops:defaultExpansion}));
 const expandedStops=expansion.scope===expansionScope&&expansion.initialized?expansion.stops:defaultExpansion;
 useEffect(()=>{
  const ids=JSON.parse(stopIds) as string[];
  setExpansion(previous=>{
   if(previous.scope!==expansionScope||!previous.initialized)return {scope:expansionScope,initialized:ids.length>0,stops:Object.fromEntries(ids.map(id=>[id,id===defaultStopId]))};
   if(Object.keys(previous.stops).length===ids.length&&ids.every(id=>Object.hasOwn(previous.stops,id)))return previous;
   // New stops start collapsed; removed/inaccessible stops lose their UI state.
   return {...previous,stops:Object.fromEntries(ids.map(id=>[id,previous.stops[id]??false]))};
  });
 },[expansionScope,stopIds,defaultStopId]);
 const toggleStop=(stopId:string)=>setExpansion(previous=>{
  const stops=previous.scope===expansionScope&&previous.initialized?previous.stops:defaultExpansion;
  return {scope:expansionScope,initialized:true,stops:{...stops,[stopId]:!stops[stopId]}};
 });
 const [snapshot,setSnapshot]=useState<{scope:string;rows:TripReceipt[]}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!token)return;let active=true;
  const endpoint=`/delivery/assignments/${encodeURIComponent(assignmentId)}/receipts`;
  void apiGetCached<ApiResponse<TripReceipt[]>>(`${endpoint}?view=${refreshKey}-${retry}`,token,1000,endpoint).then(result=>{
   if(!active)return;
   if(!result.success||!Array.isArray(result.data))throw Error(result.message||'Submitted PODs could not load.');
   setSnapshot({scope,rows:result.data.filter(row=>row.trip_id===tripId&&row.assignment_id===assignmentId)});setError('');
  }).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[token,assignmentId,tripId,scope,refreshKey,retry]);
 const rows=(snapshot?.scope===scope?snapshot.rows:[]).map(row=>{
  const reviewed=workspace.pod_cargo_reviews?.find(review=>review.id===row.id&&review.assignment_id===assignmentId&&review.trip_id===tripId);
  return reviewed&&Number(reviewed.pod_review_version??0)>=Number(row.pod_review_version??0)?{...row,...reviewed}:row;
 });
 return <details className="delivery-card delivery-cargo-disclosure">
  <summary><Package size={17} aria-hidden/>Cargo &amp; delivery documents<span>{workspace.cargo.length} items</span></summary>
  {error&&<p role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
  {workspace.stops.map(stop=>{
   const products=truckerCargoRows(workspace,rows,stop.id),delivered=products.filter(row=>row.state.delivered).length;
   const podCount=podSubmissions(rows.filter(row=>row.trip_stop_id===stop.id)).length;
   const expanded=expandedStops[stop.id]??false,contentId=`${panelId}-stop-${stop.id}`,headingId=`${contentId}-heading`;
   return <section key={stop.id} className="delivery-cargo-stop" aria-label={`Cargo for ${stop.store?.name??'Delivery stop'}`}>
   <h2><button type="button" id={headingId} className="delivery-cargo-stop-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={()=>toggleStop(stop.id)}><span><strong>{stop.stop_sequence}. {stop.store?.name??'Delivery stop'}</strong><small>{products.length} {products.length===1?'product':'products'} &middot; {delivered} delivered &middot; {podCount} POD {podCount===1?'record':'records'}</small></span><ChevronDown size={17} aria-hidden/></button></h2>
   <div id={contentId} className="delivery-cargo-stop-content" hidden={!expanded}>
   <ul className="delivery-cargo-products">{products.map(({cargo,state,pod})=><li key={cargo.id} data-allocation-id={cargo.id} data-delivered={state.delivered} className="delivery-cargo-product">
    <div className="delivery-cargo-product-heading"><strong title={cargo.line.customer_model||cargo.line.product?.model_code||'Product'}>{cargo.line.customer_model||cargo.line.product?.model_code||'Product'}</strong><span className="delivery-cargo-product-status" data-status={state.delivered?'DELIVERED':state.review??'NONE'}>{state.label}{pod&&!state.complete?` · POD ${state.review==='APPROVED'?'Approved':state.review==='REJECTED'?'Rejected':'Pending'}`:''}</span></div>
    <div className="delivery-cargo-product-meta">DR {cargo.line.dr_number||stop.dr_number||'not assigned'} &middot; {cargo.quantity} assigned &middot; {cargo.remaining} remaining</div>
   </li>)}</ul>
   <SubmittedPodDocuments rows={rows} stopId={stop.id} store={stop.store?.name??'Delivery stop'} onRetry={()=>setRetry(n=>n+1)}/>
   </div>
  </section>;})}
 </details>;
}
