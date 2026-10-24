import {Fragment,useCallback,useEffect,useId,useState,type ReactNode} from "react";
import {AnimatePresence,motion,useReducedMotion} from "motion/react";
import {useSearchParams} from "react-router-dom";
import {ArrowRight,Check,MapPin,Package,Truck,Warehouse} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {apiGetCached,invalidateApiCache,type ApiResponse} from "../../services/api.service";
import {subscribeCollaborationEvents} from "../../services/collaboration.service";
import {cleanActivityNote} from "../../services/activity-presentation";
import type {TripAssignmentRecord,TripChildRecord,TripRecord,TripEvent} from "../../services/trip.service";
import type {RoadTrip} from "../../services/road-routing";
import TruckerUpdates from "./home/TruckerUpdates";
import RoadRoutingPanel from "./RoadRoutingPanel";
import {TruckJourneyIllustration} from "./home/HomePrimitives";
import "./trip-tracking.css";

type Allocation={id:string;assignment_id:string;trip_line_item_id:string;quantity:string|number;allocated_cbm:string|number};
type Responsibility={assignment_id:string;trip_stop_id:string;progress:string};
type Convoy={assignments:TripAssignmentRecord[];stops:TripChildRecord[];cargo:TripChildRecord[];allocations:Allocation[];responsibilities:Responsibility[]};
const text=(v:unknown,fallback="Not recorded")=>typeof v==="string"&&v||typeof v==="number"?String(v):fallback;
const amount=(n:number)=>n.toLocaleString("en-PH",{maximumFractionDigits:2});
const done=(s:unknown)=>["COMPLETED","DELIVERED"].includes(String(s??"").toUpperCase());

export default function TripTrackingWorkspace({trip,assignments,stops,events,origin,destination,progress,totalCbm,totalQty,onManage,refreshKey}:{
 trip:TripRecord;assignments:TripAssignmentRecord[];stops:TripChildRecord[];events:TripEvent[];origin:string;destination:string;progress:number;totalCbm:number;totalQty:number;onManage:(assignmentId?:string)=>void;refreshKey:number;
}){
 const reduced=useReducedMotion();
 const reveal={hidden:{opacity:reduced?1:0,y:reduced?0:8},visible:{opacity:1,y:0,transition:{duration:reduced?0:.24}}};
 const {accessToken}=useAuth();const [query,setQuery]=useSearchParams();
 const tripId=String(trip.id),endpoint=`/trips/${encodeURIComponent(tripId)}/convoy`,scope=`${accessToken}:${tripId}`;
 const [snapshot,setSnapshot]=useState<{scope:string;data:Convoy}|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 const [roads,setRoads]=useState<RoadTrip[]>([]);
 const convoy=snapshot?.scope===scope?snapshot.data:null;
 const trucks=convoy?.assignments??assignments;
 const selectedId=query.get("assignment")||trucks.find(a=>!a.unassigned_at)?.id||trucks[0]?.id||"";
 const selected=trucks.find(a=>a.id===selectedId),road=roads.find(r=>r.key===selectedId&&r.tripId===tripId);
 const select=useCallback((id:string)=>setQuery(previous=>{const next=new URLSearchParams(previous);next.set("assignment",id);return next;},{replace:true}),[setQuery]);
 const onRoad=useCallback((row:RoadTrip|null)=>{if(row&&row.key!==selectedId)select(row.key);},[selectedId,select]);
 useEffect(()=>{
  if(!accessToken)return;let current=true,busy=false,queued=false;
  const load=async(fresh=false)=>{if(busy){queued=true;return;}busy=true;try{if(fresh)invalidateApiCache(endpoint);const r=await apiGetCached<ApiResponse<Convoy>>(endpoint,accessToken,10000);if(!r.success||!r.data)throw Error();if(current){setSnapshot({scope,data:r.data});setError("");}}catch{if(current)setError("Truck allocation details could not refresh.");}finally{busy=false;if(current&&queued){queued=false;void load(true);}}};
  void load();const topics=["trip_truck_assignments","trip_stops","trip_line_items","trip_cargo_allocations","trip_assignment_stops","trucks","drivers"];
  const unsubscribe=subscribeCollaborationEvents(e=>{if(e.kind==="connected"||e.kind==="signal"&&topics.includes(e.topic)||e.kind==="commit"&&topics.includes(e.commit.source))void load(true);});
  return()=>{current=false;unsubscribe();};
 },[accessToken,endpoint,scope,retry,refreshKey]);
 const dates=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric",timeZone:"Asia/Manila"}):"Not scheduled";
 const demo=String(trip.remarks??"").includes("[ALZHEN_");
 const truckName=(a:TripAssignmentRecord)=>text(a.truck?.plate_number,"Truck not recorded");
 const driverName=(a:TripAssignmentRecord)=>[a.driver?.first_name,a.driver?.last_name].filter(v=>typeof v==="string").join(" ")||"Driver not assigned";
 const scopedStops=road?.stops??(selected?.stop_scope==="ALL"?(convoy?.stops??stops).map((stop,index)=>({id:String(stop.id),name:text(stop.store_name,`Delivery stop ${stop.stop_sequence??index+1}`),sequence:Number(stop.stop_sequence??index+1),status:convoy?.responsibilities.find(r=>r.assignment_id===selectedId&&r.trip_stop_id===stop.id)?.progress??text(stop.delivery_status,"PENDING")})):[]);
 const allocations=convoy?.allocations.filter(a=>a.assignment_id===selectedId)??[];
 const positionStep=road?.position&&<li className="is-current"><Truck size={17} aria-hidden="true"/><div><strong>{road.position.simulated?"Demo truck position":"Last recorded truck position"}</strong><small>{new Date(road.position.capturedAt).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Manila"})} PHT</small></div></li>;
 const pendingIndex=scopedStops.findIndex(stop=>!done(stop.status));
 return <motion.div className="trip-tracking-workspace" initial="hidden" animate="visible" variants={{visible:{transition:{staggerChildren:reduced?0:.045}}}}>
  <motion.header variants={reveal} className="trip-command-header"><TruckJourneyIllustration/><div className="trip-command-identity"><p className="trip-kicker">Delivery workspace{demo&&<span className="trip-small-badge">Demo</span>}</p><h1>{text(trip.dispatch_number,"Trip details")}</h1><div className="trip-command-meta"><span className="trip-status-label" data-status={String(trip.status).toUpperCase()}>{text(trip.status).replaceAll("_"," ").toLowerCase()}</span><span>{text(trip.trip_reference,trip.trip_number?`Trip ${trip.trip_number}`:"")}</span></div><p className="trip-command-route">{origin}<ArrowRight size={15} aria-hidden="true"/>{destination}</p></div>
   <div className="trip-header-facts"><div><small>Loading</small><strong>{dates(trip.loading_date)}</strong></div><div><small>Estimated delivery</small><strong>{dates(trip.estimated_delivery_date)}</strong></div><div><small>Selected truck / driver</small><strong>{selected?truckName(selected):"Choose a truck"}</strong><span>{selected?driverName(selected):""}</span></div><div><small>Trip cargo</small><strong>{amount(totalCbm)} CBM</strong><span>{amount(totalQty)} units</span></div></div>
   <div className="trip-header-progress"><span>Delivery progress</span><strong>{progress}%</strong><div role="progressbar" aria-label="Overall delivery progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{transform:`scaleX(${progress/100})`}}/></div></div>
  </motion.header>
  <motion.section variants={reveal} className="trip-trucks-section" aria-label="Truck assignments"><header><div><p className="trip-kicker">Assigned fleet</p><h2>{trucks.length} truck{trucks.length===1?"":"s"} on this trip</h2></div><button type="button" onClick={()=>onManage(selected?.id)}>Manage assignments & cargo</button></header>
   {error&&<p role="status">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}
   {!!query.get("assignment")&&!selected&&trucks.length>0&&<p role="alert">The requested truck assignment does not belong to this trip. Select one below.</p>}
   <div className="trip-truck-grid">{trucks.map(a=>{
    const allocated=convoy?.allocations.filter(row=>row.assignment_id===a.id)??[],gps=roads.find(r=>r.key===a.id&&r.tripId===tripId);
    const responsibilities=convoy?.responsibilities.filter(r=>r.assignment_id===a.id)??[];
    const stopCount=a.stop_scope==="ALL"?(convoy?.stops??stops).length:responsibilities.length;
    return <button type="button" key={a.id} className="trip-truck-card" aria-pressed={a.id===selectedId} onClick={()=>select(a.id)}><span className="trip-truck-card-title"><Truck size={19} aria-hidden="true"/><strong>{truckName(a)}</strong><span>{a.id===selectedId?"Selected":a.unassigned_at?"Ended":"Assigned"}</span></span><p>{driverName(a)}</p><small>{text(a.truck?.truck_type,"Type not recorded")} / {text(a.trucking_company?.name,"Company not recorded")}</small><div><span><strong>{convoy?amount(allocated.reduce((sum,row)=>sum+Number(row.allocated_cbm||0),0)):"—"}</strong> CBM assigned</span><span>{responsibilities.length?`${responsibilities.filter(r=>done(r.progress)).length}/${stopCount} stops`:"Progress not tracked"}</span></div><small>{gps?.position?gps.position.simulated?"Demo GPS sample":`GPS recorded ${new Date(gps.position.capturedAt).toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Manila"})}`:gps?"No recorded GPS":"GPS details unavailable"}</small></button>;
   })}</div>{!trucks.length&&<p>No truck assignments have been saved.</p>}
  </motion.section>
  <motion.div variants={reveal} className="trip-journey-grid"><section className="trip-journey-panel" aria-label="Delivery journey"><h2>Delivery journey</h2><p className="trip-muted">{selected?`${truckName(selected)} / ${driverName(selected)}`:"Select an assigned truck"}</p><motion.ol key={selectedId} initial={reduced?false:{opacity:.4,x:4}} animate={{opacity:1,x:0}} transition={{duration:.18}}><li className={trip.departure_from_warehouse_at?"is-complete":""}><Warehouse size={17} aria-hidden="true"/><div><strong>{origin}</strong><small>Warehouse{trip.departure_from_warehouse_at?` / Departed ${new Date(String(trip.departure_from_warehouse_at)).toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Manila"})}`:" / Departure not recorded"}</small></div></li>{!scopedStops.length&&positionStep}{scopedStops.map((stop,i)=><Fragment key={stop.id}>{i===pendingIndex&&positionStep}<li className={done(stop.status)?"is-complete":""}>{done(stop.status)?<Check size={17} aria-hidden="true"/>:<MapPin size={17} aria-hidden="true"/>}<div><strong>{stop.name}</strong><small>Stop {stop.sequence??i+1} / {String(stop.status).replaceAll("_"," ").toLowerCase()}{i===scopedStops.length-1?" / Final destination":""}</small></div></li></Fragment>)}{pendingIndex<0&&scopedStops.length>0&&positionStep}</motion.ol>{!scopedStops.length&&<p className="trip-muted">No stop responsibilities available for this truck.</p>}</section>
   <section className="trip-tracking-map" aria-label="Selected truck map"><header><h2>Route monitoring</h2><span>{selected?truckName(selected):"No assigned truck"}</span></header>{selected&&!selected.unassigned_at?<RoadRoutingPanel tripIds={[tripId]} height={350} compact minimal assignmentOnly focusKey={selectedId} onRows={setRoads} onSelection={onRoad}/>:<p className="trip-muted">{selected?.unassigned_at?"This assignment has ended. Its saved cargo and stop history remain available below.":"Choose a truck to inspect its route and GPS position."}</p>}</section>
  </motion.div>
  <MotionDisclosure className="trip-allocated-cargo" title={<><Package size={17} aria-hidden="true"/>Cargo on {selected?truckName(selected):"selected truck"} <span>{allocations.length} allocation{allocations.length===1?"":"s"}</span></>}><div className="trip-cargo-scroll"><table><thead><tr><th>Product / model</th><th>Quantity</th><th>Allocated CBM</th><th>Delivery receipt</th></tr></thead><tbody>{allocations.map(a=>{const item=convoy?.cargo.find(i=>i.id===a.trip_line_item_id);return <tr key={a.id}><td>{text(item?.customer_model??(item?.product as Record<string,unknown>|undefined)?.name,"Cargo item")}</td><td>{amount(Number(a.quantity))}</td><td>{amount(Number(a.allocated_cbm))}</td><td>{text(item?.dr_number,"Not recorded")}</td></tr>;})}</tbody></table>{!allocations.length&&<p className="trip-muted">{convoy?"No cargo allocations saved for this truck.":"Loading cargo allocations…"}</p>}</div></MotionDisclosure>
  <MotionDisclosure className="trip-field-activity" title="Trucker activity"><TruckerUpdates snapshot={{events:events.map(event=>({...event,dispatch_number:text(trip.dispatch_number)})),detailsLoading:false}} trips={[{id:tripId,reference:text(trip.dispatch_number),driver:trucks.map(driverName).join(", "),plates:trucks.map(truckName),demonstration:demo}]} roads={roads} selected={road??null} active={true} onOpenTrip={()=>document.querySelector(".trip-command-header")?.scrollIntoView({block:"start"})}/></MotionDisclosure>
  {Boolean(trip.remarks)&&<MotionDisclosure className="trip-remarks" title="Dispatch notes"><p>{cleanActivityNote(String(trip.remarks))}</p></MotionDisclosure>}
 </motion.div>;
}

function MotionDisclosure({title,children,className}:{title:ReactNode;children:ReactNode;className:string}){
 const [open,setOpen]=useState(false),reduced=useReducedMotion(),id=useId();
 return <section className={className}><button className="trip-disclosure-trigger" type="button" aria-label={typeof title==="string"?title:undefined} aria-controls={id} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{title}<span aria-hidden="true" className="trip-disclosure-icon">{open?"−":"+"}</span></button><AnimatePresence initial={false}>{open&&<motion.div id={id} initial={{height:reduced?"auto":0,opacity:reduced?1:0}} animate={{height:"auto",opacity:1}} exit={{height:reduced?"auto":0,opacity:reduced?1:0}} transition={{duration:reduced?0:.2,ease:"easeOut"}} style={{overflow:"hidden"}}>{children}</motion.div>}</AnimatePresence></section>;
}
