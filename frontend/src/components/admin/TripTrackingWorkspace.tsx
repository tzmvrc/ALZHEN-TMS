import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {useSearchParams} from 'react-router-dom';
import {ArrowRight,CalendarDays,CalendarClock,MapPinned,Maximize2,Minimize2,Package,Truck} from 'lucide-react';
import {useAuth} from '../../context/AuthContext';
import {apiGetCached,invalidateApiCache,type ApiResponse} from '../../services/api.service';
import {subscribeCollaborationEvents} from '../../services/collaboration.service';
import {cleanActivityNote} from '../../services/activity-presentation';
import {fetchTripEvents,invalidateTripEventsCache,type TripAssignmentRecord,type TripChildRecord,type TripRecord,type TripEvent} from '../../services/trip.service';
import type {OperationsReportData} from '../../services/operations-report.service';
import type {RoadTrip} from '../../services/road-routing';
import {assignmentWorkspace,tripText as text,tripAmount as amount,tripDone as done,tripStatus as status,type Convoy} from '../../services/trip-workspace-data';
import DeliveryCargoSummary from '../delivery/DeliveryCargoSummary';
import TripOperationalTimeline from './TripOperationalTimeline';
import TripOperationalInspector from './TripOperationalInspector';
import {operationalPhases,type OperationalMilestone} from '../../services/operational-timeline';
import RoadRoutingPanel from './RoadRoutingPanel';
import type {TripRecordTarget} from './TripDeliveryOperations';
import {TruckJourneyIllustration} from './home/HomePrimitives';
import './trip-tracking.css';
import './trip-operational-workspace.css';

export default function TripTrackingWorkspace({trip,assignments,stops,events,origin,destination,progress,totalCbm,totalQty,onManage,refreshKey,loading=false,operations=null,bookingRows=[],operationsError,onOpenReport}:{
 trip:TripRecord;assignments:TripAssignmentRecord[];stops:TripChildRecord[];events:TripEvent[];origin:string;destination:string;progress:number;totalCbm:number;totalQty:number;onManage:(assignmentId?:string)=>void;refreshKey:number;loading?:boolean;operations?:OperationsReportData|null;bookingRows?:Record<string,unknown>[];operationsError?:string|null;onOpenReport:(target:TripRecordTarget)=>void;
}){
 const reduced=useReducedMotion();
 const reveal={hidden:{opacity:reduced?1:0,y:reduced?0:8},visible:{opacity:1,y:0,transition:{duration:reduced?0:.24}}};
 const {accessToken}=useAuth();const [query,setQuery]=useSearchParams();
 const tripId=String(trip.id),endpoint=`/trips/${encodeURIComponent(tripId)}/convoy`,scope=`${accessToken}:${tripId}`;
 const [snapshot,setSnapshot]=useState<{scope:string;data:Convoy}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [roads,setRoads]=useState<RoadTrip[]>([]),[expanded,setExpanded]=useState(false);
 const mapPanel=useRef<HTMLElement|null>(null),expandButton=useRef<HTMLButtonElement|null>(null);
 const convoy=snapshot?.scope===scope?snapshot.data:null;
 const trucks=convoy?.assignments??assignments,allStops=convoy?.stops??stops;
 const activeTrucks=trucks.filter(a=>!a.unassigned_at),pending=!convoy&&!error;
 const selectedId=query.get('assignment')||activeTrucks[0]?.id||trucks[0]?.id||'';
 const selected=trucks.find(a=>a.id===selectedId),road=roads.find(r=>r.assignmentId===selectedId&&r.tripId===tripId);
 const selectedData=useMemo(()=>assignmentWorkspace(selected,convoy,stops,road,bookingRows),[selected,convoy,stops,road?.stops,bookingRows]);

 const routeTripIds=useMemo(()=>[tripId],[tripId]);
 const select=useCallback((id:string)=>setQuery(previous=>{const next=new URLSearchParams(previous);next.set('assignment',id);next.delete('stop');next.delete('event');return next;},{replace:true}),[setQuery]);
 const onRoad=useCallback((row:RoadTrip|null)=>{if(row&&row.key!==selectedId)select(row.key);},[selectedId,select]);
 useEffect(()=>{
  if(!accessToken)return;let current=true,busy=false,queued=false;
  const load=async(fresh=false)=>{if(busy){queued=true;return;}busy=true;try{if(fresh)invalidateApiCache(endpoint);const r=await apiGetCached<ApiResponse<Convoy>>(endpoint,accessToken,10000);if(!r.success||!r.data)throw Error();if(current){setSnapshot({scope,data:r.data});setError('');}}catch{if(current)setError('Truck allocation details could not refresh.');}finally{busy=false;if(current&&queued){queued=false;void load(true);}}};
  void load();const topics=['trip_truck_assignments','trip_stops','trip_line_items','trip_cargo_allocations','trip_assignment_stops','trucks','drivers'];
  const unsubscribe=subscribeCollaborationEvents(e=>{if(e.kind==='connected'||e.kind==='signal'&&topics.includes(e.topic)||e.kind==='commit'&&topics.includes(e.commit.source)&&(!e.commit.tripId||e.commit.tripId===tripId))void load(true);});
  return()=>{current=false;unsubscribe();};
 },[accessToken,endpoint,scope,retry,refreshKey]);
 useEffect(()=>{if(!expanded)return;const before=document.body.style.overflow,previous=document.activeElement as HTMLElement|null;document.body.style.overflow='hidden';expandButton.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false);}if(event.key==='Tab'){const controls=Array.from(mapPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select,input,[tabindex="0"]')??[]).filter(e=>e.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=before;document.removeEventListener('keydown',key);previous?.focus({preventScroll:true});};},[expanded]);
 const [eventSnapshot,setEventSnapshot]=useState<{scope:string;rows:TripEvent[]}|null>(null),[eventError,setEventError]=useState(''),[eventRevision,setEventRevision]=useState(0);
 const sourceEvents=eventSnapshot?.scope===scope?eventSnapshot.rows:events;
 useEffect(()=>setEventSnapshot(null),[events]);
 useEffect(()=>{if(!accessToken)return;let current=true,busy=false,queued=false,timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{if(busy){queued=true;return;}busy=true;try{invalidateTripEventsCache(tripId);const rows=await fetchTripEvents(accessToken,tripId);if(current){setEventSnapshot({scope,rows});setEventError('');}}catch{if(current)setEventError('Saved event updates could not refresh. Previous records remain visible.');}finally{busy=false;if(current&&queued){queued=false;void load();}}};
  if(eventRevision)void load();
  const off=subscribeCollaborationEvents(e=>{if(e.kind==='connected'||e.kind==='commit'&&e.commit.source==='trip_events'&&e.commit.tripId===tripId||e.kind==='signal'&&e.topic==='trip_events'){clearTimeout(timer);timer=setTimeout(()=>void load(),300);}});
  return()=>{current=false;clearTimeout(timer);off();};
 },[accessToken,tripId,scope,eventRevision]);
 const phases=useMemo(()=>operationalPhases({events:sourceEvents,assignmentId:selectedId,trip,data:selectedData,operations,origin}),[sourceEvents,selectedId,trip,selectedData,operations,origin]);
 const eventKey=query.get('event');
 const allMilestones=phases.flatMap(phase=>phase.milestones);
 const eventParts=(eventKey??'').split(':');
 const derivedKey=eventParts[0]==='trip_stops'?`${eventParts[1]}:${eventParts[2]==='DELIVERY_ARRIVAL'?'ARRIVED':eventParts[2]}`:eventParts[0]==='loading_reports'?`warehouse:${eventParts[2]}`:eventParts[0]==='backloads'?`BACKLOAD:${eventParts[1]}`:eventParts[0]==='offloads'?`OFFLOAD:${eventParts[1]}`:null;
 const selectedMilestone=allMilestones.find(m=>m.key===eventKey||derivedKey&&m.key===derivedKey)??null;
 const backToRoute=useCallback(()=>setQuery(previous=>{const next=new URLSearchParams(previous);next.delete('event');return next;},{replace:true}),[setQuery]);
 const chooseMilestone=(milestone:OperationalMilestone)=>{setExpanded(false);setQuery(previous=>{const next=new URLSearchParams(previous);next.set('assignment',selectedId);next.set('event',milestone.key);if(milestone.stopId)next.set('stop',milestone.stopId);else next.delete('stop');return next;},{replace:true});};
 useEffect(()=>{if(selectedMilestone&&window.matchMedia('(max-width: 800px)').matches)mapPanel.current?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});},[selectedMilestone?.key,reduced]);
 const dates=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}):'Not scheduled';
 const demo=String(trip.remarks??'').includes('[ALZHEN_');
 const truckName=(a:TripAssignmentRecord)=>text(a.truck?.plate_number,'Truck not recorded');
 const driverName=(a:TripAssignmentRecord)=>[a.driver?.first_name,a.driver?.last_name].filter(v=>typeof v==='string').join(' ')||'Driver not assigned';
 const overallCbm=convoy?convoy.cargo.reduce((n,r)=>n+(Number(r.cbm)||0),0):totalCbm;
 const overallQty=convoy?convoy.cargo.reduce((n,r)=>n+(Number(r.quantity)||0),0):totalQty;
 const completed=allStops.filter(s=>done(s.delivery_status)).length;
 const overallProgress=convoy?(allStops.length?Math.round(completed/allStops.length*100):0):progress;
 const destinationNames=[...new Set(roads.filter(r=>r.tripId===tripId).flatMap(r=>r.stops.map(s=>s.name)))];
 const routeDestination=destinationNames.length?destinationNames.join(' / '):destination==='Store destinations not available'?`${allStops.length} saved delivery stops${loading?' / loading destinations':''}`:destination;
 const roadsReady=roads.some(r=>r.tripId===tripId);
 const openReport=(target:TripRecordTarget)=>{if(target==='activity')document.getElementById(`trip-${tripId}-operations`)?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});else onOpenReport(target);};
 const selectedProgress=selectedData.stops.length?Math.round(selectedData.completed/selectedData.stops.length*100):0;
 return <motion.div className="trip-tracking-workspace" initial="hidden" animate="visible" variants={{visible:{transition:{staggerChildren:reduced?0:.035}}}}>
  <motion.header variants={reveal} className="trip-command-header"><div className="trip-command-main"><div className="trip-command-identity"><p className="trip-kicker">Trip workspace{demo&&<span className="trip-small-badge">Demo</span>}</p><div className="trip-title-line"><h1>{text(trip.dispatch_number,'Trip details')}</h1><span className="trip-status-label" data-status={String(trip.status).toUpperCase()}>{status(trip.status)}</span></div><p className="trip-command-route"><span>{origin}</span><ArrowRight size={14} aria-hidden="true"/><span>{routeDestination}</span></p></div><div className="trip-header-illustration"><TruckJourneyIllustration loop wide/></div></div>
   <div className="trip-header-facts">{[{label:'Loading',value:dates(trip.loading_date),Icon:CalendarDays},{label:'Estimated delivery',value:dates(trip.estimated_delivery_date),Icon:CalendarClock},{label:'Dispatch cargo',value:pending?'Loading...':`${amount(overallCbm)} CBM / ${amount(overallQty)} units`,Icon:Package},{label:'Fleet / destinations',value:pending?'Loading...':`${activeTrucks.length} truck${activeTrucks.length===1?'':'s'} / ${allStops.length} stop${allStops.length===1?'':'s'}`,Icon:Truck}].map(({label,value,Icon})=><div key={label}><Icon className="trip-fact-watermark" aria-hidden="true"/><span className="trip-fact-label"><Icon size={15} aria-hidden="true"/>{label}</span><strong>{value}</strong></div>)}</div>
   <div className="trip-header-progress"><span>{text(trip.trip_reference,'Delivery progress')}</span><strong>{pending?'Loading progress':`${overallProgress}% complete`}</strong><div className="trip-progress-road" role="progressbar" aria-label="Overall delivery progress" aria-valuenow={overallProgress} aria-valuemin={0} aria-valuemax={100}><i style={{transform:`scaleX(${overallProgress/100})`}}/><span className="trip-progress-truck" style={{left:`${Math.min(100,Math.max(0,overallProgress))}%`}}><Truck size={22} aria-hidden="true"/></span></div></div>
  </motion.header>
  {error&&<p role="status" className="trip-empty-note">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}
  <section className="trip-operations-workspace" aria-label="Trip operations workspace"><header className="trip-workspace-tools"><div><Truck size={18} aria-hidden="true"/><label><span>Monitoring truck</span><select aria-label="Selected truck assignment" value={selectedId} onChange={e=>select(e.target.value)} disabled={!trucks.length}>{trucks.map(a=><option key={a.id} value={a.id}>{truckName(a)} / {driverName(a)}{a.unassigned_at?' / Ended':''}</option>)}</select></label></div><nav aria-label="Trip management actions"><button type="button" onClick={()=>onManage(selected?.id)}>Manage assignments & cargo</button><button type="button" onClick={()=>onOpenReport('operations')}>Manage reports</button><button type="button" onClick={()=>onOpenReport('records')}>Photos & records</button><button type="button" onClick={()=>onOpenReport('receipts')}>POD review</button></nav></header>
  {!!query.get('assignment')&&!selected&&<p role="alert" className="trip-empty-note">This assignment is unavailable. Choose a truck above.</p>}
  {eventKey&&!selectedMilestone&&!loading&&<p role="status" className="trip-empty-note">This event is unavailable for the selected truck. <button type="button" onClick={backToRoute}>Back to route</button></p>}
  <motion.div variants={reveal} className="trip-journey-grid"><div id={`trip-${tripId}-operations`}>{selected?<TripOperationalTimeline phases={phases} truckLabel={selected?`${truckName(selected)} / ${driverName(selected)}`:undefined} selected={selectedMilestone?.key??null} onSelect={chooseMilestone} onClear={backToRoute} loading={loading||pending} error={eventError||operationsError||operations?.evidence_error||(operations?.evidence_limited?'Attachment indicators cover recent report files. Manage reports includes older files.':undefined)}/>:<p className="trip-empty-note">Select a truck assignment to inspect its saved operations.</p>}</div>
   <section ref={mapPanel} className={`trip-tracking-map trip-monitor-detail${expanded?' is-map-expanded':''}`} aria-label="Route and event workspace" role={expanded?'dialog':undefined} aria-modal={expanded||undefined} tabIndex={-1}><div className="trip-monitor-stack"><div className="trip-route-view" aria-hidden={Boolean(selectedMilestone)} inert={Boolean(selectedMilestone)}><header className="trip-panel-heading"><span className="trip-panel-icon"><MapPinned size={19} aria-hidden="true"/></span><div><h2>Route monitoring</h2><p>{selected?`${truckName(selected)} / ${driverName(selected)}`:'Select an assigned truck'}</p></div><button ref={expandButton} type="button" className="trip-map-expand" aria-label={expanded?'Close expanded map':'Expand route map'} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button></header><div className="trip-map-context"><span className={road?.position?'has-gps':''}><span aria-hidden="true"/>{road?.position?(road.position.simulated?'Demo / Simulated GPS':'Recorded GPS'):roadsReady?'GPS not recorded':'Loading GPS...'}</span><span>{selectedData.progressKnown?`${selectedData.completed}/${selectedData.stops.length} stops / ${selectedProgress}%`:'Trip-level stop status'}</span></div>{selected&&!selected.unassigned_at?<RoadRoutingPanel tripIds={routeTripIds} height={420} compact minimal assignmentOnly focusKey={selectedId} onRows={setRoads} onSelection={onRoad}/>:<div className="trip-map-empty"><Truck size={30} aria-hidden="true"/><p>{selected?.unassigned_at?'This assignment has ended. Saved history remains available.':'Choose a truck to inspect its route.'}</p></div>}</div>
   {selectedMilestone&&selected&&<TripOperationalInspector key={`${selectedId}:${selectedMilestone.key}`} milestone={selectedMilestone} assignmentId={selectedId} plate={truckName(selected)} driver={driverName(selected)} onBack={backToRoute} onReviewed={()=>setEventRevision(v=>v+1)} onOpenReport={openReport} operations={operations}/>}
   </div></section>
  </motion.div></section>
  <section className="trip-allocated-cargo"><header className="trip-section-heading"><Package size={17} aria-hidden="true"/><h2>Cargo on {selected?truckName(selected):'selected truck'}</h2><span>{selectedData.cargo.length} allocations</span></header>{selected&&<DeliveryCargoSummary key={selectedId} assignmentId={selectedId} tripId={tripId}/>}</section>
  {Boolean(trip.remarks)&&<section className="trip-remarks"><h2 className="trip-section-heading">Dispatch notes</h2><p>{cleanActivityNote(String(trip.remarks))}</p></section>}
 </motion.div>;
}