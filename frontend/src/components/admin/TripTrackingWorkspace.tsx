import {roadPositionLabel,warehouseEstimate} from '../../services/road-routing';
import RoadProgress from '../ui/RoadProgress';
import {confirmedOperationalProgress,confirmedStateProgress} from '../../services/operational-progress';
import ReceiptReviewCard from './ReceiptReviewCard';
import type {TripReceipt} from '../../services/receipt.service';
import {eventsWithPodReviews} from '../../services/pod-submissions';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {useSearchParams} from 'react-router-dom';
import {ArrowRight,CalendarDays,CalendarClock,MapPinned,Maximize2,Minimize2,Package,Truck} from 'lucide-react';
import {useAuth} from '../../context/AuthContext';
import {apiGetCached,invalidateApiCache,type ApiResponse} from '../../services/api.service';
import {subscribeCollaborationEvents,collaborationSnapshot} from '../../services/collaboration.service';
import {cleanActivityNote} from '../../services/activity-presentation';
import {fetchTripEvents,invalidateTripEventsCache,type TripAssignmentRecord,type TripChildRecord,type TripRecord,type TripEvent} from '../../services/trip.service';
import {fetchTripOperations,type OperationsReportData} from '../../services/operations-report.service';
import type {RoadTrip} from '../../services/road-routing';
import {assignmentWorkspace,tripText as text,tripAmount as amount,tripStatus as status,type Convoy} from '../../services/trip-workspace-data';
import DeliveryCargoSummary from '../delivery/DeliveryCargoSummary';
import TripOperationalTimeline from './TripOperationalTimeline';
import ConvoyEventDetails from './ConvoyEventDetails';
import {convoyMilestone} from '../../services/convoy-event-details';
import {operationalPhases,type OperationalMilestone} from '../../services/operational-timeline';
import RoadRoutingPanel from './RoadRoutingPanel';
import type {TripRecordTarget} from './TripDeliveryOperations';
import {TruckJourneyIllustration} from './home/HomePrimitives';
import './trip-tracking.css';
import './trip-operational-workspace.css';

export default function TripTrackingWorkspace({trip,assignments,stops,events,origin,destination,progress:_progress,totalCbm,totalQty,refreshKey,loading=false,operations:initialOperations=null,bookingRows=[],operationsError,onOpenReport}:{
 trip:TripRecord;assignments:TripAssignmentRecord[];assignmentsLoading?:boolean;stops:TripChildRecord[];events:TripEvent[];origin:string;destination:string;progress:number;totalCbm:number;totalQty:number;refreshKey:number;loading?:boolean;operations?:OperationsReportData|null;bookingRows?:Record<string,unknown>[];operationsError?:string|null;onOpenReport:(target:TripRecordTarget)=>void;
}){
 const reduced=useReducedMotion();
 const reveal={hidden:{opacity:reduced?1:0,y:reduced?0:8},visible:{opacity:1,y:0,transition:{duration:reduced?0:.24}}};
 const {accessToken}=useAuth();const [query,setQuery]=useSearchParams();
 const tripId=String(trip.id),endpoint=`/trips/${encodeURIComponent(tripId)}/convoy`,scope=`${accessToken}:${tripId}`;
 const [snapshot,setSnapshot]=useState<{scope:string;data:Convoy}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [roads,setRoads]=useState<RoadTrip[]>([]),[expanded,setExpanded]=useState(false);
 const mapPanel=useRef<HTMLElement|null>(null),expandButton=useRef<HTMLButtonElement|null>(null);
 const convoy=snapshot?.scope===scope?snapshot.data:null;
 const [operationSnapshot,setOperationSnapshot]=useState<{scope:string;seed:OperationsReportData|null;data:OperationsReportData}|null>(null);
 const operations=operationSnapshot?.scope===scope&&operationSnapshot.seed===initialOperations?operationSnapshot.data:initialOperations;
 const trucks=(convoy?.assignments??assignments).filter(a=>a.trip_id===tripId),allStops=convoy?.stops??stops;
 const activeTrucks=trucks.filter(a=>!a.unassigned_at),pending=!convoy&&!error;
 const [selectionSnapshot,setSelectionSnapshot]=useState<{scope:string;id:string}|null>(null);
 const requestedId=query.get('assignment');
 const rememberedId=selectionSnapshot?.scope===scope?selectionSnapshot.id:null;
 const selectedId=trucks.some(a=>a.id===requestedId)?requestedId!:trucks.some(a=>a.id===rememberedId)?rememberedId!:activeTrucks[0]?.id||trucks[0]?.id||'';
 // The assignment endpoint and convoy can return different row orders. Keep
 // the first usable selection stable when the richer response arrives.
 useEffect(()=>{if(selectedId)setSelectionSnapshot(previous=>previous?.scope===scope&&previous.id===selectedId?previous:{scope,id:selectedId});},[scope,selectedId]);
 const selected=trucks.find(a=>a.id===selectedId),road=roads.find(r=>r.assignmentId===selectedId&&r.tripId===tripId);
 const selectedData=useMemo(()=>assignmentWorkspace(selected,convoy,stops,road,bookingRows),[selected,convoy,stops,road,bookingRows]);

 const routeTripIds=useMemo(()=>[tripId],[tripId]);
 const select=useCallback((id:string)=>{if(id!==selectedId&&document.getElementById(`trip-${tripId}-pod`)?.querySelector('[data-unsaved="true"]')&&!window.confirm('Discard unsaved POD changes and switch truck assignments?'))return;setQuery(previous=>{const next=new URLSearchParams(previous);next.set('assignment',id);return next;},{replace:true});},[setQuery,selectedId,tripId]);
 useEffect(()=>{
  if(!accessToken)return;let current=true,busy=false,queued=false,timer:ReturnType<typeof setTimeout>|undefined;
  const load=async(fresh=false)=>{if(busy){queued=true;return;}busy=true;try{if(fresh)invalidateApiCache(endpoint);const r=await apiGetCached<ApiResponse<Convoy>>(endpoint,accessToken,10000);if(!r.success||!r.data)throw Error();if(current){setSnapshot({scope,data:r.data});setError('');}}catch{if(current)setError('Truck allocation details could not refresh.');}finally{busy=false;if(current&&queued){queued=false;void load(true);}}};
  void load();const topics=['trip_truck_assignments','trip_stops','trip_line_items','trip_cargo_allocations','trip_assignment_stops','trucks','drivers','trip_events','trip_images','pod_records','pod_review_events'];
  const unsubscribe=subscribeCollaborationEvents(e=>{if(e.kind==='connected'||e.kind==='signal'&&topics.includes(e.topic)||e.kind==='commit'&&topics.includes(e.commit.source)&&(!e.commit.tripId||e.commit.tripId===tripId)){clearTimeout(timer);timer=setTimeout(()=>void load(true),150);}});
  return()=>{current=false;clearTimeout(timer);unsubscribe();};
 },[accessToken,endpoint,scope,retry,refreshKey,tripId]);
 useEffect(()=>{if(!expanded)return;const before=document.body.style.overflow,previous=document.activeElement as HTMLElement|null;document.body.style.overflow='hidden';expandButton.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false);}if(event.key==='Tab'){const controls=Array.from(mapPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select,input,[tabindex="0"]')??[]).filter(e=>e.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=before;document.removeEventListener('keydown',key);previous?.focus({preventScroll:true});};},[expanded]);
 const [eventSnapshot,setEventSnapshot]=useState<{scope:string;seed:TripEvent[];rows:TripEvent[]}|null>(null),[eventError,setEventError]=useState(''),[eventRevision,setEventRevision]=useState(0);
 const [receiptSnapshot,setReceiptSnapshot]=useState<{scope:string;rows:TripReceipt[]|null}|null>(null);
 const receiptRows=receiptSnapshot?.scope===scope?receiptSnapshot.rows:null;
 const receiveReceipts=useCallback((rows:TripReceipt[]|null)=>setReceiptSnapshot({scope,rows}),[scope]);
 const baseEvents=eventSnapshot?.scope===scope&&eventSnapshot.seed===events?eventSnapshot.rows:events;
 const sourceEvents=useMemo(()=>eventsWithPodReviews(baseEvents,receiptRows??[]),[baseEvents,receiptRows]);
 useEffect(()=>{if(!accessToken)return;let live=true,busy=false,wantEvents=false,wantReports=false,timer:ReturnType<typeof setTimeout>|undefined;
  const reportSources=['loading_reports','unloading_reports','backloads','offloads','demurrages','incidents','report_receipts','pod_records'];
  const load=async()=>{if(busy)return;busy=true;const eventsDirty=wantEvents,reportsDirty=wantReports;wantEvents=false;wantReports=false;
   try{await Promise.all([
    eventsDirty?(async()=>{invalidateTripEventsCache(tripId);const rows=await fetchTripEvents(accessToken,tripId);if(live)setEventSnapshot({scope,seed:events,rows});})():Promise.resolve(),
    reportsDirty?(async()=>{invalidateApiCache(`/reports/operations/trips/${encodeURIComponent(tripId)}`);const data=await fetchTripOperations(accessToken,tripId,'metadata');if(live)setOperationSnapshot({scope,seed:initialOperations,data});})():Promise.resolve(),
   ]);if(live)setEventError('');}catch{if(live)setEventError('Saved operational updates could not refresh. Previous records remain visible.');}finally{busy=false;if(live&&(wantEvents||wantReports))schedule();}
  };
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void load(),250);};
  wantEvents=true;if(eventRevision)wantReports=true;schedule();
  const off=subscribeCollaborationEvents(e=>{
   if(e.kind==='connected'){wantEvents=true;wantReports=true;schedule();}
   if(e.kind==='commit'&&e.commit.tripId===tripId){if(['trip_events','trip_images','pod_review_events'].includes(e.commit.source))wantEvents=true;if(reportSources.includes(e.commit.source))wantReports=true;if(wantEvents||wantReports)schedule();}
   // Signal snapshots reconcile missed changes when the scoped bridge is unavailable.
   if(e.kind==='signal'&&!collaborationSnapshot().bridgeHealthy){if(['trip_events','trip_images','pod_review_events'].includes(e.topic))wantEvents=true;if(reportSources.includes(e.topic))wantReports=true;if(wantEvents||wantReports)schedule();}
  });
  return()=>{live=false;clearTimeout(timer);off();};
 },[accessToken,tripId,scope,eventRevision,events,initialOperations]);
 const phases=useMemo(()=>operationalPhases({events:sourceEvents,assignmentId:selectedId,trip,data:selectedData,operations,origin,podStates:convoy?.operational_state}),[sourceEvents,selectedId,trip,selectedData,operations,origin,convoy?.operational_state]);
 const eventKey=query.get('event');
 const [eventAnchor,setEventAnchor]=useState<{scope:string;key:string;milestone:OperationalMilestone}|null>(null);
 const allMilestones=phases.flatMap(phase=>phase.milestones);
 const eventParts=(eventKey??'').split(':');
 const derivedKey=eventParts[0]==='trip_stops'?`${eventParts[1]}:${eventParts[2]==='DELIVERY_ARRIVAL'?'ARRIVED':eventParts[2]}`:eventParts[0]==='loading_reports'?`warehouse:${eventParts[2]}`:eventParts[0]==='backloads'?`BACKLOAD:${eventParts[1]}`:eventParts[0]==='offloads'?`OFFLOAD:${eventParts[1]}`:null;
 // Resolve the selected destination across the convoy before projecting it onto
 // the active truck. The URL keeps the original stop identity when trucks switch.
 const convoyDetails=trucks.map(assignment=>{const data=assignmentWorkspace(assignment,convoy,stops,roads.find(r=>r.assignmentId===assignment.id),bookingRows);return {assignment,data,phases:operationalPhases({events:sourceEvents,assignmentId:assignment.id,trip,data,operations,origin,podStates:convoy?.operational_state})};});
 const resolvedAnchor=convoyDetails.flatMap(row=>row.phases.flatMap(phase=>phase.milestones)).find(m=>m.key===eventKey||derivedKey&&m.key===derivedKey)??null;
 // Keep only the selected milestone identity when its source assignment is
 // removed. Other trucks must still project their own saved event or pending state.
 useEffect(()=>{if(!resolvedAnchor||!eventKey)return;setEventAnchor(previous=>previous?.scope===scope&&previous.key===eventKey&&previous.milestone.type===resolvedAnchor.type&&previous.milestone.stopId===resolvedAnchor.stopId&&previous.milestone.title===resolvedAnchor.title?previous:{scope,key:eventKey,milestone:resolvedAnchor});},[scope,eventKey,resolvedAnchor]);
 const anchor=resolvedAnchor??(eventAnchor?.scope===scope&&eventAnchor.key===eventKey?eventAnchor.milestone:null);
 const matchedMilestone=anchor?convoyMilestone(anchor,allMilestones,selectedId,selectedData.stops,allStops):null;
 const selectedMilestone=matchedMilestone?{...matchedMilestone,key:allMilestones.find(m=>m.type===matchedMilestone.type&&m.stopId===matchedMilestone.stopId&&(!anchor?.activity||m.title===anchor.title))?.key??matchedMilestone.key}:null;
 const backToRoute=useCallback(()=>setQuery(previous=>{const next=new URLSearchParams(previous);next.delete('event');return next;},{replace:true}),[setQuery]);
 const chooseMilestone=(milestone:OperationalMilestone)=>{setExpanded(false);setQuery(previous=>{const next=new URLSearchParams(previous);next.set('assignment',selectedId);next.set('event',milestone.key);if(milestone.stopId)next.set('stop',milestone.stopId);else next.delete('stop');return next;},{replace:true});};
 const selectedMilestoneKey=selectedMilestone?.key;
 useEffect(()=>{if(selectedMilestoneKey&&window.matchMedia('(max-width: 800px)').matches)mapPanel.current?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});},[selectedMilestoneKey,reduced]);
 const dates=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}):'Not scheduled';
 const demo=String(trip.remarks??'').includes('[ALZHEN_');
 const truckName=(a:TripAssignmentRecord)=>text(a.truck?.plate_number,'Truck not recorded');
 const driverName=(a:TripAssignmentRecord)=>[a.driver?.first_name,a.driver?.last_name].filter(v=>typeof v==='string').join(' ')||'Driver not assigned';
 const overallCbm=convoy?convoy.cargo.reduce((n,r)=>n+(Number(r.cbm)||0),0):totalCbm;
 const overallQty=convoy?convoy.cargo.reduce((n,r)=>n+(Number(r.quantity)||0),0):totalQty;
 const pods=useMemo(()=>(convoy?.operational_state??[]).map(r=>({assignment_id:r.assignment_id,trip_stop_id:r.trip_stop_id,approved:r.pod_approved})),[convoy?.operational_state]);
 const overallProgress=useMemo(()=>convoy?.operational_state?confirmedStateProgress(convoy.operational_state,allStops.filter(s=>!s.archived_at&&!convoy.operational_state!.some(r=>r.trip_stop_id===s.id)).length).percent:confirmedOperationalProgress(trucks,allStops,sourceEvents,convoy?.responsibilities,pods).percent,[trucks,allStops,sourceEvents,convoy?.responsibilities,pods,convoy?.operational_state]);
 const destinationNames=[...new Set(roads.filter(r=>r.tripId===tripId).flatMap(r=>r.stops.map(s=>s.name)))];
 const routeDestination=destinationNames.length?destinationNames.join(' / '):destination==='Store destinations not available'?`${allStops.length} saved delivery stops${loading?' / loading destinations':''}`:destination;
 const roadsReady=roads.some(r=>r.tripId===tripId);
 const openReport=(target:TripRecordTarget)=>{if(target==='receipts'){document.getElementById(`trip-${tripId}-pod`)?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});return;}if(target==='activity')document.getElementById(`trip-${tripId}-operations`)?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});else onOpenReport(target);};
 const selectedProgress=useMemo(()=>convoy?.operational_state?confirmedStateProgress(convoy.operational_state.filter(r=>r.assignment_id===selectedId)).percent:confirmedOperationalProgress(trucks,allStops,sourceEvents,convoy?.responsibilities,pods,selectedId).percent,[trucks,allStops,sourceEvents,convoy?.responsibilities,pods,selectedId,convoy?.operational_state]);
 return <motion.div className="trip-tracking-workspace" initial="hidden" animate="visible" variants={{visible:{transition:{staggerChildren:reduced?0:.035}}}}>
  <motion.header variants={reveal} className="trip-command-header"><div className="trip-command-main"><div className="trip-command-identity"><p className="trip-kicker">Trip workspace{demo&&<span className="trip-small-badge">Demo</span>}</p><div className="trip-title-line"><h1>{text(trip.dispatch_number,'Trip details')}</h1><span className="trip-status-label" data-status={String(trip.status).toUpperCase()}>{status(trip.status)}</span></div><p className="trip-command-route"><span>{origin}</span><ArrowRight size={14} aria-hidden="true"/><span>{routeDestination}</span></p></div><div className="trip-header-illustration"><TruckJourneyIllustration loop wide/></div></div>
   <div className="trip-header-facts">{[{label:'Loading',value:dates(trip.loading_date),Icon:CalendarDays},{label:'Estimated delivery',value:dates(trip.estimated_delivery_date),Icon:CalendarClock},{label:'Dispatch cargo',value:pending?'Loading...':`${amount(overallCbm)} CBM / ${amount(overallQty)} units`,Icon:Package},{label:'Fleet / destinations',value:pending?'Loading...':`${activeTrucks.length} truck${activeTrucks.length===1?'':'s'} / ${allStops.length} stop${allStops.length===1?'':'s'}`,Icon:Truck}].map(({label,value,Icon})=><div key={label}><Icon className="trip-fact-watermark" aria-hidden="true"/><span className="trip-fact-label"><Icon size={15} aria-hidden="true"/>{label}</span><strong>{value}</strong></div>)}</div>
   <div className="trip-header-progress"><span>{text(trip.trip_reference,'Delivery progress')}</span><strong>{pending?'Loading progress':`${overallProgress}% complete`}</strong><RoadProgress percent={overallProgress} label="Overall delivery progress"/></div>
  </motion.header>
  {error&&<p role="status" className="trip-empty-note">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}
  <section className="trip-operations-workspace" aria-label="Trip operations workspace"><header className="trip-workspace-tools"><nav aria-label="Trip management actions"><button type="button" onClick={()=>onOpenReport('operations')}>Manage reports</button><button type="button" onClick={()=>onOpenReport('records')}>Photos & records</button></nav></header>
  {!!query.get('assignment')&&!selected&&<p role="alert" className="trip-empty-note">No accessible truck assignment is available.</p>}
  {eventKey&&!selectedMilestone&&!loading&&<p role="status" className="trip-empty-note">This event is unavailable for the selected truck. <button type="button" onClick={backToRoute}>Back to route</button></p>}
  <motion.div variants={reveal} className="trip-journey-grid"><div id={`trip-${tripId}-operations`}>{selected?<TripOperationalTimeline phases={phases} truckLabel={selected?`${truckName(selected)} / ${driverName(selected)}`:undefined} selected={selectedMilestone?.key??null} onSelect={chooseMilestone} onClear={backToRoute} loading={loading||pending} error={eventError||operationsError||operations?.evidence_error||(operations?.evidence_limited?'Attachment indicators cover recent report files. Manage reports includes older files.':undefined)}/>:<p className="trip-empty-note">Select a truck assignment to inspect its saved operations.</p>}</div>
   <section ref={mapPanel} className={`trip-tracking-map trip-monitor-detail${expanded?' is-map-expanded':''}`} aria-label="Route and event workspace" role={expanded?'dialog':undefined} aria-modal={expanded||undefined} tabIndex={-1}><div className="trip-monitor-stack"><div className="trip-route-view" aria-hidden={Boolean(selectedMilestone)} inert={Boolean(selectedMilestone)}><header className="trip-panel-heading"><span className="trip-panel-icon"><MapPinned size={19} aria-hidden="true"/></span><div><h2>Route monitoring</h2><p>{selected?`${truckName(selected)} / ${driverName(selected)}`:'Select an assigned truck'}</p></div><button ref={expandButton} type="button" className="trip-map-expand" aria-label={expanded?'Close expanded map':'Expand route map'} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button></header><div className="trip-map-context"><span className={road?.position&&!warehouseEstimate(road)?'has-gps':''}><span aria-hidden="true"/>{road?roadPositionLabel(road):roadsReady?'Location Unavailable':'Loading GPS...'}</span><span>{(selectedData.progressKnown||convoy?.operational_state)?`${selectedData.completed}/${selectedData.stops.length} stops / ${selectedProgress}%`:'Trip-level stop status'}</span></div>{selected&&!selected.unassigned_at?<RoadRoutingPanel tripIds={routeTripIds} height={420} compact minimal assignmentOnly focusKey={selectedId} onRows={setRoads}/>:<div className="trip-map-empty"><Truck size={30} aria-hidden="true"/><p>{selected?.unassigned_at?'This assignment has ended. Saved history remains available.':'Choose a truck to inspect its route.'}</p></div>}</div>
   {selectedMilestone&&selected&&<ConvoyEventDetails activeAssignmentId={selectedId} onSelectAssignment={select} rows={convoyDetails.map(({assignment,data,phases})=>({assignmentId:assignment.id,plate:truckName(assignment),driver:driverName(assignment),milestone:convoyMilestone(anchor!,phases.flatMap(p=>p.milestones),assignment.id,data.stops,allStops)}))} onBack={backToRoute} onReviewed={()=>setEventRevision(v=>v+1)} onOpenReport={openReport} operations={operations}/>}
   </div></section>
  </motion.div></section>
  <section className="trip-pod-review" id={`trip-${tripId}-pod`}><ReceiptReviewCard key={`${tripId}:${selectedId}`} tripId={tripId} accessToken={accessToken} onRecordsChange={receiveReceipts} inline assignmentId={selectedId} assignments={trucks.map(a=>({id:a.id,label:`${truckName(a)} / ${driverName(a)}`}))} dispatchNumber={text(trip.dispatch_number)} stopLabels={Object.fromEntries(allStops.map(s=>[String(s.id),text(s.delivery_location,`Stop ${s.stop_sequence}`)]))}/></section>
  <section className="trip-allocated-cargo"><header className="trip-section-heading"><Package size={17} aria-hidden="true"/><h2>Cargo on {selected?truckName(selected):'selected truck'}</h2><span>{selectedData.cargo.length} allocations</span></header>{selected&&<DeliveryCargoSummary key={selectedId} assignmentId={selectedId} tripId={tripId} receiptRecords={receiptRows} events={sourceEvents}/>}</section>
  {Boolean(trip.remarks)&&<section className="trip-remarks"><h2 className="trip-section-heading">Dispatch notes</h2><p>{cleanActivityNote(String(trip.remarks))}</p></section>}
 </motion.div>;
}
