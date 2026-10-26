import "./home-dashboard.css";
import { useEffect, useState } from "react";
import { ArrowUpRight, Truck, AlertTriangle, Check, MapPin, Package, Camera } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { apiGetCached, invalidateApiCache, type ApiResponse } from "../../../services/api.service";
import { subscribeCollaborationEvents } from "../../../services/collaboration.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import {useNavigate} from "react-router-dom";
import {activityDescription,cleanActivityNote} from "../../../services/activity-presentation";
import type { RoadTrip } from "../../../services/road-routing";
import { EmptyState, SectionHeading } from "./HomePrimitives";
import type { HomeSnapshot, HomeTrip } from "./home-dashboard-data";

type Submission = {
  id: string; trip_id: string; driver_id: string; assignment_id?:string|null; status: string; delivery_status: string | null;
  notes: string | null; updated_at: string; receiptSubmitted: boolean;
  driver: { first_name: string | null; last_name: string | null } | null;
};
type Milestone={id:string;trip_id:string;trip_stop_id:string|null;event_type:string;event_time:string};
type ActivityRead={rows:Submission[];limited:boolean;milestones?:Milestone[];milestonesLimited?:boolean;unavailableSources?:string[]};
type Update = { assignmentId?:string|null; id: string; tripId: string; driverId?: string | null; stopId?:string|null; title: string; detail?: string | null; time: string; driver: string; plate: string; demo: boolean; source: string };

export default function TruckerUpdates({ snapshot, trips, roads, selected, active, onOpenTrip }: {
  snapshot: Pick<HomeSnapshot,"events"|"detailsLoading">; trips: Array<Pick<HomeTrip,"id"|"reference"|"driver"|"plates"|"demonstration">>; roads: RoadTrip[]; selected: RoadTrip | null;
  active: boolean; onOpenTrip?: (id: string) => void;
}) {
  const { accessToken } = useAuth();
  const navigate=useNavigate();
  const identity = [...new Set([...(selected?[selected.tripId]:[]),...trips.map(trip => trip.id).sort()])].slice(0,50).sort().join(",");
  const [read, setRead] = useState<{identity:string;token:string;data:ActivityRead}|null>(null);
  const [error,setError] = useState("");
  useEffect(() => {
    if (!accessToken || !identity || !active) return;
    let current=true, busy=false, queued=false;
    const endpoint=`/tracking/roads/updates?trip_ids=${encodeURIComponent(identity)}`;
    const refresh=async()=>{
      if(busy){queued=true;return;} busy=true;
      try {
        const result=await apiGetCached<ApiResponse<ActivityRead>>(endpoint,accessToken,30000);
        if(!result.success||!result.data)throw Error("Driver submissions unavailable.");
        if(current){setRead({identity,token:accessToken,data:result.data});setError("");}
      } catch {if(current)setError("Driver submissions could not refresh. Saved trip events remain below.");}
      finally{busy=false;if(current&&queued){queued=false;void refresh();}}
    };
    void refresh();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const schedule=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;invalidateApiCache(endpoint);void refresh();},300);};
    const resume=()=>{if(document.visibilityState==='visible')schedule();};
    document.addEventListener('visibilitychange',resume);
    const unsubscribe=subscribeCollaborationEvents(event=>{
      if(event.kind==="connected"||event.kind==="signal"&&["trip_events","driver_trip_updates","loading_reports","unloading_reports","backloads","offloads","incidents","trip_stops"].includes(event.topic)||event.kind==="commit"&&["trip_events","driver_trip_updates","loading_reports","unloading_reports","backloads","offloads","incidents","trip_stops"].includes(event.commit.source)&&(!event.commit.tripId||identity.split(',').includes(event.commit.tripId)))schedule();
    });
    const stopAdmin=subscribeToAdminRealtime(event=>{
      if(event.kind==='resume'||event.kind==='batch'&&event.tables.some(table=>["trip_events","driver_trip_updates","loading_reports","unloading_reports","backloads","offloads","incidents","trip_stops"].includes(table)))schedule();
    });
    return()=>{current=false;clearTimeout(timer);document.removeEventListener('visibilitychange',resume);unsubscribe();stopAdmin();};
  },[accessToken,identity,active]);
  const submissions=read?.identity===identity&&read.token===accessToken?read.data.rows:[];
  const updates:Update[]=[];
  const milestones=read?.identity===identity&&read.token===accessToken?read.data.milestones??[]:[];
  for(const event of [...snapshot.events,...milestones]){
    const trip=trips.find(trip=>trip.id===event.trip_id);if(!trip)continue;
    if(event.event_type==='DEMO_SIMULATED_GPS')continue;
    // Trip events need not be driver-authored. State their provenance explicitly.
    const explicit=("assignment_id" in event?event.assignment_id:undefined)||("notes" in event?event.notes?.match(/\[assignment:([0-9a-f-]{36})\]/i)?.[1]:undefined);
    const relevant=roads.filter(road=>road.tripId===event.trip_id&&(!explicit||road.assignmentId===explicit)&&(!event.trip_stop_id||road.stops.some(stop=>stop.id===event.trip_stop_id)));
    const assigned=(explicit||event.trip_stop_id)&&relevant.length===1?relevant[0]:undefined;
    updates.push({id:`event:${event.id}`,tripId:trip.id,assignmentId:assigned?.assignmentId,driverId:assigned?.driverId,stopId:event.trip_stop_id,title:event.event_type==='CUSTOM_STATUS'&&'delivery_metadata' in event&&event.delivery_metadata?.title?event.delivery_metadata.title:activityDescription(event.event_type,relevant[0]?.stops.find(stop=>stop.id===event.trip_stop_id)?.name),detail:"notes" in event?event.notes:undefined,time:event.event_time,driver:assigned?.driverName??"Dispatch activity",plate:assigned?.plateNumber??"",demo:trip.demonstration,source:event.id.startsWith("incidents:")?"Incident report":/^(loading_reports|trip_stops|backloads|offloads):/.test(event.id)?"Operational report":"Saved activity"});
  }
  for(const row of submissions){
    const trip=trips.find(trip=>trip.id===row.trip_id);if(!trip)continue;
    const candidates=roads.filter(road=>road.tripId===row.trip_id&&road.driverId===row.driver_id&&!!row.assignment_id&&road.assignmentId===row.assignment_id);
    const truck=candidates.length===1?candidates[0]:undefined;
    const driver=[row.driver?.first_name,row.driver?.last_name].filter(Boolean).join(" ")||"Driver unavailable";
    updates.push({id:`submission:${row.id}`,tripId:row.trip_id,assignmentId:truck?.assignmentId,driverId:row.driver_id,title:`${activityDescription(row.status)}${row.receiptSubmitted?" / Receipt included":""}`,detail:row.notes,time:row.updated_at,driver,plate:truck?.plateNumber??"",demo:trip.demonstration,source:trip.demonstration?"Demo driver update":"Driver submission"});
  }
  const canonical=[...new Map(updates.map(row=>[row.id,row])).values()];
  const grouped=new Map<string,Update>();
  for(const row of canonical){const key=`${row.tripId}:${row.assignmentId??row.driver}:${row.stopId??""}:${Date.parse(row.time)}:${row.title.replace(/ at .*/,"")}`,previous=grouped.get(key);const saved=(id:string)=>/^event:[0-9a-f-]{36}$/i.test(id);if(!previous||saved(row.id)||!saved(previous.id))grouped.set(key,row);}
  const uniqueUpdates=[...grouped.values()];
  const rows=uniqueUpdates.filter(row=>Number.isFinite(Date.parse(row.time))&&(!selected||row.tripId===selected.tripId&&!!row.assignmentId&&row.assignmentId===selected.assignmentId))
    .sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||a.id.localeCompare(b.id)).slice(0,30);
  return <aside className="home-panel home-trucker-updates" aria-label="Latest from the field">
    <SectionHeading title="Latest from the field" description="Saved delivery milestones / Philippine time"><Truck size={18} aria-hidden="true"/></SectionHeading>
    <div className="home-update-tools"><span>{selected?`${selected.plateNumber??"Selected truck"} / ${selected.driverName??"Driver not recorded"}`:"All trucks / latest first"}</span></div>
    {(error||!!read?.data.unavailableSources?.length)&&<p role="status" className="home-update-warning">{error||"Some operational report sources are unavailable. Available saved updates remain below."}</p>}
    <ol className="home-field-vertical" aria-label={selected?'Selected truck recent activity':'Latest fleet activity'} tabIndex={0}>{rows.map((row,index)=>{
      const trip=trips.find(trip=>trip.id===row.tripId),incident=/backload|offload|accident|traffic|delay|breakdown|incident/i.test(row.title),complete=/completed|finished|submitted|departed/i.test(row.title);
      const Icon=incident?AlertTriangle:/POD|receipt|photo/i.test(row.title)?Camera:/load/i.test(row.title)?Package:/arriv|GPS/i.test(row.title)?MapPin:complete?Check:Truck;
      const tone=incident?'incident':index===0?'active':complete?'complete':'recorded';
      return <li key={row.id} data-tone={tone}><button type="button" onClick={()=>{const params=new URLSearchParams();if(row.assignmentId)params.set('assignment',row.assignmentId);if(row.stopId)params.set('stop',row.stopId);params.set('event',row.id.replace(/^event:/,''));if(row.assignmentId||row.stopId||row.id.startsWith('event:'))navigate(`/trips/${encodeURIComponent(row.tripId)}?${params}`);else onOpenTrip?.(row.tripId);}}><span className="home-milestone-node"><Icon size={17} aria-hidden="true"/></span><span className="home-milestone-plate">{row.plate||row.driver}<span className="home-field-source">{row.source}</span><ArrowUpRight size={12} aria-hidden="true"/></span><strong>{row.title}</strong>{row.detail&&<span className="home-milestone-remark">{cleanActivityNote(row.detail).replace(/^SIMULATED (?:demonstration event|activity for a fictional driver)\.\s*/i,'')}</span>}<time dateTime={row.time}>{new Date(row.time).toLocaleString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'})}</time><small>{row.driver}{trip?.reference?` / ${trip.reference}`:''}</small>{row.demo&&<span className="home-field-demo">Demo</span>}</button></li>;
    })}</ol>
    {!rows.length&&<EmptyState title={snapshot.detailsLoading?"Loading activity":"No saved activity"} icon={Truck}>Recorded updates will appear here.</EmptyState>}
    <details className="home-field-scope"><summary>Saved activity / Philippine time</summary><p>Latest 30 available updates. Saved submissions cover up to 50 loaded trips.{read?.data.limited?" Driver submissions are limited to the latest 100 records.":""}{read?.data.milestonesLimited?" Operational milestones are limited to the latest 100 available events.":""} Dispatch-wide or ambiguous events appear only in All Trucks; selected-truck activity requires a verified assignment association.</p></details>
  </aside>;
}
