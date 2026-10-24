import { useEffect, useState } from "react";
import { ArrowUpRight, MapPin, Truck } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { apiGet, type ApiResponse } from "../../../services/api.service";
import { subscribeCollaborationEvents } from "../../../services/collaboration.service";
import type { RoadTrip } from "../../../services/road-routing";
import { EmptyState, SectionHeading } from "./HomePrimitives";
import type { HomeSnapshot, HomeTrip } from "./home-dashboard-data";

type Submission = {
  id: string; trip_id: string; driver_id: string; status: string; delivery_status: string | null;
  notes: string | null; updated_at: string; receiptSubmitted: boolean;
  driver: { first_name: string | null; last_name: string | null } | null;
};
type Update = { id: string; tripId: string; driverId?: string | null; title: string; detail?: string | null; time: string; driver: string; plate: string; demo: boolean; source: string };

export default function TruckerUpdates({ snapshot, trips, roads, selected, active, onOpenTrip }: {
  snapshot: HomeSnapshot; trips: HomeTrip[]; roads: RoadTrip[]; selected: RoadTrip | null;
  active: boolean; onOpenTrip?: (id: string) => void;
}) {
  const { accessToken } = useAuth();
  const identity = [...new Set([...(selected?[selected.tripId]:[]),...trips.map(trip => trip.id).sort()])].slice(0,50).sort().join(",");
  const [read, setRead] = useState<{identity:string;token:string;rows:Submission[];limited:boolean}|null>(null);
  const [error,setError] = useState("");
  const [all,setAll] = useState(false);
  useEffect(()=>setAll(false),[selected?.key]);
  useEffect(() => {
    if (!accessToken || !identity || !active) return;
    let current=true, busy=false, queued=false;
    const refresh=async()=>{
      if(busy){queued=true;return;} busy=true;
      try {
        const result=await apiGet<ApiResponse<{rows:Submission[];limited:boolean}>>(`/tracking/roads/updates?trip_ids=${encodeURIComponent(identity)}`,accessToken);
        if(!result.success||!result.data)throw Error("Driver submissions unavailable.");
        if(current){setRead({identity,token:accessToken,...result.data});setError("");}
      } catch {if(current)setError("Driver submissions could not refresh. Saved trip events remain below.");}
      finally{busy=false;if(current&&queued){queued=false;void refresh();}}
    };
    void refresh();
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000);
    const unsubscribe=subscribeCollaborationEvents(event=>{
      if(event.kind==="connected"||event.kind==="signal"&&event.topic==="driver_trip_updates"||event.kind==="commit"&&event.commit.source==="driver_trip_updates")void refresh();
    });
    return()=>{current=false;clearInterval(timer);unsubscribe();};
  },[accessToken,identity,active]);
  const submissions=read?.identity===identity&&read.token===accessToken?read.rows:[];
  const updates:Update[]=[];
  for(const event of snapshot.events){
    const trip=trips.find(trip=>trip.id===event.trip_id);if(!trip)continue;
    if(event.event_type==="DEMO_SIMULATED_GPS"&&roads.some(road=>road.tripId===event.trip_id&&road.position?.simulated&&Date.parse(road.position.capturedAt)===Date.parse(event.event_time)))continue;
    // Trip events need not be driver-authored. State their provenance explicitly.
    updates.push({id:`event:${event.id}`,tripId:trip.id,title:event.event_type.toLowerCase().replaceAll("_"," "),detail:event.notes,time:event.event_time,driver:trip.driver,plate:trip.plates.join(", "),demo:trip.demonstration,source:"Trip event"});
  }
  for(const row of submissions){
    const trip=trips.find(trip=>trip.id===row.trip_id);if(!trip)continue;
    const truck=roads.find(road=>road.tripId===row.trip_id&&road.driverId===row.driver_id);
    const driver=[row.driver?.first_name,row.driver?.last_name].filter(Boolean).join(" ")||"Driver unavailable";
    updates.push({id:`submission:${row.id}`,tripId:row.trip_id,driverId:row.driver_id,title:row.receiptSubmitted?`${row.status} · Receipt submitted`:row.status,detail:row.notes,time:row.updated_at,driver,plate:truck?.plateNumber??"",demo:trip.demonstration,source:trip.demonstration?"Demo driver update":"Driver submission"});
  }
  for(const road of roads){
    if(!road.position||!trips.some(trip=>trip.id===road.tripId))continue;
    updates.push({id:`gps:${road.key}`,tripId:road.tripId,driverId:road.driverId,title:road.position.simulated?"Simulated GPS sample":"Latest recorded GPS",time:road.position.capturedAt,driver:road.driverName??"Driver unavailable",plate:road.plateNumber??"",demo:!!road.demonstration||!!road.position.simulated,source:"GPS position"});
  }
  const rows=updates.filter(row=>Number.isFinite(Date.parse(row.time))&&(all||!selected||row.tripId===selected.tripId&&(!row.driverId||row.driverId===selected.driverId)))
    .sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||a.id.localeCompare(b.id)).slice(0,30);
  return <aside className="home-panel home-trucker-updates" aria-label="Trucker Updates">
    <SectionHeading title="Trucker Updates" description="Saved driver submissions, GPS and trip milestones."><Truck size={19} aria-hidden="true"/></SectionHeading>
    <div className="home-update-tools"><span>{!all&&selected?`${selected.plateNumber??"Selected trip"} · ${selected.dispatchNumber??""}`:"All monitored trips"}</span><button type="button" className="home-text-button" aria-pressed={all} onClick={()=>setAll(value=>!value)}>{all?"Follow map":"View all updates"}</button></div>
    {error&&<p role="status" className="home-update-warning">{error}</p>}
    <ol className="home-update-list" aria-label="Latest operational updates" tabIndex={0}>{rows.map(row=>{
      const trip=trips.find(trip=>trip.id===row.tripId);
      return <li key={row.id}><button type="button" onClick={()=>onOpenTrip?.(row.tripId)}><span className={`home-update-icon ${row.demo?"is-demo":""}`}><MapPin size={15} aria-hidden="true"/></span><span className="home-update-content"><span className="home-update-title">{row.title}<ArrowUpRight size={12} aria-hidden="true"/></span><strong>{row.driver}{row.plate?` · ${row.plate}`:""}</strong><small>{trip?.reference} · {row.source}{!row.driverId&&row.source==="Trip event"?" (trip-wide)":""}</small>{row.demo&&<span className="home-demo-label">{row.source==="GPS position"?"Demo / Simulated GPS":"Demonstration event"}</span>}{row.detail&&<p>{row.detail.replace(/\[(?:ALZHEN_[A-Z0-9_]+|assignment:[0-9a-f-]+)\]\s*/g,"")}</p>}<time dateTime={row.time}>{new Date(row.time).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Manila"})} PHT</time></span></button></li>;
    })}</ol>
    {!rows.length&&<EmptyState title={snapshot.detailsLoading?"Loading trucker updates":"No saved updates for this selection"} icon={Truck}>Driver submissions and recorded trip events appear here.</EmptyState>}
    <p className="home-updates-scope">Latest 30 updates from loaded trips. GPS and driver submissions cover up to 50 trips.{read?.limited?" Driver submissions are limited to the latest 100 records.":""} Trip events apply to the dispatch; they are not attributed to an individual driver.</p>
  </aside>;
}
