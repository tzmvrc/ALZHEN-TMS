import "./home-dashboard.css";
import { useEffect, useState } from "react";
import { ArrowUpRight, Truck } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { apiGet, type ApiResponse } from "../../../services/api.service";
import { subscribeCollaborationEvents } from "../../../services/collaboration.service";
import {useNavigate} from "react-router-dom";
import {activityDescription,assignmentTripUrl} from "../../../services/activity-presentation";
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
    const refresh=async()=>{
      if(busy){queued=true;return;} busy=true;
      try {
        const result=await apiGet<ApiResponse<ActivityRead>>(`/tracking/roads/updates?trip_ids=${encodeURIComponent(identity)}`,accessToken);
        if(!result.success||!result.data)throw Error("Driver submissions unavailable.");
        if(current){setRead({identity,token:accessToken,data:result.data});setError("");}
      } catch {if(current)setError("Driver submissions could not refresh. Saved trip events remain below.");}
      finally{busy=false;if(current&&queued){queued=false;void refresh();}}
    };
    void refresh();
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000);
    const unsubscribe=subscribeCollaborationEvents(event=>{
      if(event.kind==="connected"||event.kind==="signal"&&["driver_trip_updates","loading_reports","unloading_reports","backloads","offloads","incidents","trip_stops"].includes(event.topic)||event.kind==="commit"&&["driver_trip_updates","loading_reports","unloading_reports","backloads","offloads","incidents","trip_stops"].includes(event.commit.source))void refresh();
    });
    return()=>{current=false;clearInterval(timer);unsubscribe();};
  },[accessToken,identity,active]);
  const submissions=read?.identity===identity&&read.token===accessToken?read.data.rows:[];
  const updates:Update[]=[];
  const milestones=read?.identity===identity&&read.token===accessToken?read.data.milestones??[]:[];
  for(const event of [...snapshot.events,...milestones]){
    const trip=trips.find(trip=>trip.id===event.trip_id);if(!trip)continue;
    if(event.event_type==="DEMO_SIMULATED_GPS"&&roads.some(road=>road.tripId===event.trip_id&&road.position?.simulated&&Date.parse(road.position.capturedAt)===Date.parse(event.event_time)))continue;
    // Trip events need not be driver-authored. State their provenance explicitly.
    const explicit="notes" in event?event.notes?.match(/\[assignment:([0-9a-f-]{36})\]/i)?.[1]:undefined;
    const relevant=roads.filter(road=>road.tripId===event.trip_id&&(!explicit||road.assignmentId===explicit)&&(!event.trip_stop_id||road.stops.some(stop=>stop.id===event.trip_stop_id)));
    const assigned=(explicit||event.trip_stop_id)&&relevant.length===1?relevant[0]:undefined;
    updates.push({id:`event:${event.id}`,tripId:trip.id,assignmentId:assigned?.assignmentId,driverId:assigned?.driverId,stopId:event.trip_stop_id,title:activityDescription(event.event_type,relevant[0]?.stops.find(stop=>stop.id===event.trip_stop_id)?.name),detail:"notes" in event?event.notes:undefined,time:event.event_time,driver:assigned?.driverName??"Dispatch activity",plate:assigned?.plateNumber??"",demo:trip.demonstration,source:"Trip event"});
  }
  for(const row of submissions){
    const trip=trips.find(trip=>trip.id===row.trip_id);if(!trip)continue;
    const candidates=roads.filter(road=>road.tripId===row.trip_id&&road.driverId===row.driver_id&&!!row.assignment_id&&road.assignmentId===row.assignment_id);
    const truck=candidates.length===1?candidates[0]:undefined;
    const driver=[row.driver?.first_name,row.driver?.last_name].filter(Boolean).join(" ")||"Driver unavailable";
    updates.push({id:`submission:${row.id}`,tripId:row.trip_id,assignmentId:truck?.assignmentId,driverId:row.driver_id,title:`${activityDescription(row.status)}${row.receiptSubmitted?" / Receipt included":""}`,detail:row.notes,time:row.updated_at,driver,plate:truck?.plateNumber??"",demo:trip.demonstration,source:trip.demonstration?"Demo driver update":"Driver submission"});
  }
  for(const road of roads){
    if(!road.position||!trips.some(trip=>trip.id===road.tripId))continue;
    updates.push({id:`gps:${road.key}`,tripId:road.tripId,assignmentId:road.assignmentId,driverId:road.driverId,title:road.position.simulated?"Simulated GPS sample":"Latest recorded GPS",time:road.position.capturedAt,driver:road.driverName??"Driver unavailable",plate:road.plateNumber??"",demo:!!road.demonstration||!!road.position.simulated,source:"GPS position"});
  }
  const uniqueUpdates=[...new Map(updates.map(row=>[`${row.tripId}:${row.assignmentId??row.driver}:${row.stopId??""}:${row.time}:${row.title.replace(/ at .*/,"")}`,row])).values()];
  const rows=uniqueUpdates.filter(row=>Number.isFinite(Date.parse(row.time))&&(!selected||row.tripId===selected.tripId&&!!row.assignmentId&&row.assignmentId===selected.assignmentId))
    .sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||a.id.localeCompare(b.id)).slice(0,30);
  return <aside className="home-panel home-trucker-updates" aria-label="Latest from the field">
    <SectionHeading title="Latest from the field" description="Driver activity and delivery milestones."><Truck size={18} aria-hidden="true"/></SectionHeading>
    <div className="home-update-tools"><span>{selected?`${selected.plateNumber??"Selected truck"} / ${selected.driverName??"Driver not recorded"}`:"All trucks / newest first"}</span></div>
    {(error||read?.data.unavailableSources?.length)&&<p role="status" className="home-update-warning">{error||"Some operational report sources are unavailable. Available saved updates remain below."}</p>}
    <ol className="home-field-timeline" aria-label="Latest operational updates" tabIndex={0}>{rows.map(row=>{
      const trip=trips.find(trip=>trip.id===row.tripId);
      return <li key={row.id} data-completed={/completed|Finished/.test(row.title)||undefined}><span className="home-field-dot" aria-hidden="true"/><button type="button" onClick={()=>{const truck=row.assignmentId?roads.find(road=>road.tripId===row.tripId&&road.assignmentId===row.assignmentId):null;if(truck?.assignmentId)navigate(assignmentTripUrl(row.tripId,truck.assignmentId));else onOpenTrip?.(row.tripId);}}><span className="home-field-top"><time dateTime={row.time}>{new Date(row.time).toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Manila"})}</time><strong>{row.plate?`Truck ${row.plate}`:row.driver}</strong><ArrowUpRight size={12} aria-hidden="true"/></span><p>{row.title}</p><small>{row.driver}{trip?.reference?` / ${trip.reference}`:""}</small>{row.demo&&<span className="home-field-demo">Demo</span>}</button></li>;
    })}</ol>
    {!rows.length&&<EmptyState title={snapshot.detailsLoading?"Loading activity":"No saved activity"} icon={Truck}>Recorded updates will appear here.</EmptyState>}
    <details className="home-field-scope"><summary>Saved activity / Philippine time</summary><p>Latest 30 available updates. GPS and submissions cover up to 50 loaded trips.{read?.data.limited?" Driver submissions are limited to the latest 100 records.":""}{read?.data.milestonesLimited?" Operational milestones are limited to the latest 100 available events.":""} Dispatch-wide or ambiguous events appear only in All Trucks; selected-truck activity requires a verified assignment association.</p></details>
  </aside>;
}
