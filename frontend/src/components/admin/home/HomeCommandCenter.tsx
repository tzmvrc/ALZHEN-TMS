import { useEffect, useRef, useState } from "react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, CheckCheck, CircleAlert, ClipboardList, Mail, MapPinned, Pause, Play, Radio, RefreshCw, ShieldCheck, Truck, WalletCards } from "lucide-react";
import LiveTripMap from "../LiveTripMap";
import OverviewMiniCalendar from "../OverviewMiniCalendar";
import { useRequests } from "../requestsStore";
import IncomingTripRequests from "./IncomingTripRequests";
import TruckerUpdates from "./TruckerUpdates";
import type { RoadTrip } from "../../../services/road-routing";
import { HOME_DEMO_REQUEST_ID } from "../../../pages/Admin/data/homeDemoRequest";
import HomeAnalytics from "./HomeAnalytics";
import HomeTripTable, { type HomeTripFilter } from "./HomeTripTable";
import { EmptyState, MetricsStrip, SectionHeading, TruckJourneyIllustration, type HomeMetric } from "./HomePrimitives";
import { buildHomeTrips, homeAnalytics, homeMapData, manilaDay, shortDay, type HomeSnapshot } from "./home-dashboard-data";
import "./home-dashboard.css";

export default function HomeCommandCenter({ snapshot, name, refreshing, error, onRefresh, onOpenTrip, onNavigate, active }: {
  snapshot: HomeSnapshot; name: string; refreshing: boolean; error: string | null; active: boolean;
  onRefresh: () => void; onOpenTrip?: (id: string) => void; onNavigate?: (id: string) => void;
}) {
  const [selectedRoad,setSelectedRoad] = useState<RoadTrip|null>(null);
  const [roadRows,setRoadRows] = useState<RoadTrip[]>([]);
  const [days, setDays] = useState(14);
  const [filter, setFilter] = useState<HomeTripFilter>("All");
  const [focus, setFocus] = useState<string | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [clock, setClock] = useState(Date.now());
  const reducedMotion = useReducedMotion();
  const animate = motionEnabled && !reducedMotion && active;
  const board = useRef<HTMLDivElement>(null), map = useRef<HTMLElement>(null);
  const requests = useRequests();
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setClock(Date.now()); }, 60_000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (active) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [active]);
  const trips = buildHomeTrips(snapshot);
  const analytics = homeAnalytics(trips, snapshot, days);
  const mapData = homeMapData(snapshot, trips);
  const attention = trips.filter(trip => Boolean(trip.issue));
  const focused = focus && mapData.activeIds.has(focus) ? focus : null;
  const updated = new Date(snapshot.fetchedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
  const stale = clock - snapshot.fetchedAt > 120_000;
  const navigate = (id: string) => onNavigate?.(id);
  const revealBoard = (next: HomeTripFilter) => { setFilter(next); board.current?.scrollIntoView({ behavior: animate ? "smooth" : "instant", block: "start" }); };
  const pendingRequests=requests.pending.filter(request=>requests.source==="live"||request.id===HOME_DEMO_REQUEST_ID);
  const today=manilaDay(new Date(clock).toISOString());
  const completedToday=new Set(snapshot.bookingRows.filter(row=>manilaDay(row.finish_unloading_time)===today).map(row=>String(row.trip_stop_id??row._trip_stop_id??"")).filter(Boolean)).size;
  const metrics: HomeMetric[] = [
    { label: "Active trips", value: snapshot.inProgress, note: "All non-archived / In Progress", icon: Truck, tone: "navy", onClick: () => navigate("monitoring") },
    { label: "Needs attention", value: snapshot.detailsLoading||snapshot.bookingUnavailable?null:attention.length, note: "Delayed or missing assignment / loaded trips", icon: CircleAlert, tone: "rose", onClick: () => { if(attention[0]) onOpenTrip?.(attention[0].id); else revealBoard("All"); } },
    { label: "Pending email requests", value: pendingRequests.length, note: requests.source==="live"?"Awaiting review":"Demo preview / automation not connected", icon: Mail, tone: "amber", onClick: () => document.getElementById("home-incoming-requests")?.scrollIntoView({behavior:animate?"smooth":"instant",block:"start"}) },
    { label: "Deliveries completed today", value: snapshot.detailsLoading||snapshot.bookingUnavailable?null:completedToday, note: "Recorded unloading finishes / loaded stops", icon: CheckCheck, tone: "green", onClick: () => navigate("monitoring") },
  ];
  const entrance = { initial: animate ? { opacity: 0, y: 12 } : false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };
  const deliveryDates = trips.filter(trip => trip.status !== "Completed").flatMap(trip => trip.dueDay ? [trip.dueDay] : []);
  const events = snapshot.events.filter(event => trips.some(trip => trip.id === event.trip_id) && Number.isFinite(Date.parse(event.event_time))).sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time)).slice(0, 6);
  return <MotionConfig reducedMotion={animate ? "user" : "always"}><div className="home-command-center" data-motion={animate ? "running" : "paused"}>
    <a href="#home-dispatch-board" className="home-skip-link">Skip to dispatch workspace</a>
    <motion.header {...entrance} className="home-page-heading"><div><p className="home-eyebrow">ALZHEN TMS <span>/</span> Operations command center</p><h1>Keep every delivery moving<span>.</span></h1><p className="home-description">Welcome back, {name}. Here is where operations stand.</p></div><div className="home-heading-actions"><span className={`home-sync-state ${stale || error ? "is-stale" : ""}`}><Radio size={13} aria-hidden="true"/>{refreshing ? "Refreshing" : stale || error ? "Snapshot needs refresh" : "Synced"}<small>Updated {updated} PHT</small></span><button type="button" className="home-icon-button" onClick={() => setMotionEnabled(value => !value)} aria-label={motionEnabled ? "Pause dashboard animations" : "Enable dashboard animations"} aria-pressed={!motionEnabled}>{motionEnabled ? <Pause size={16} aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}</button><button type="button" onClick={onRefresh} disabled={refreshing} className="home-button home-button-outline"><RefreshCw size={15} aria-hidden="true" className={refreshing && animate ? "home-refreshing" : ""}/>Refresh</button></div></motion.header>
    {error && <div className="home-message home-message-warning" role="alert"><CircleAlert size={17} aria-hidden="true"/><span>Refresh failed. Showing the last successful snapshot. {error}</span><button type="button" onClick={onRefresh} disabled={refreshing}>Retry</button></div>}
    <motion.div {...entrance} transition={{ duration: 0.4, delay: animate ? 0.05 : 0 }}><MetricsStrip metrics={metrics} animate={animate}/></motion.div>
    <IncomingTripRequests onNavigate={onNavigate}/>
    <div className="home-scope-line"><ShieldCheck size={14} aria-hidden="true"/><p>Headline trip counts cover all {snapshot.total.toLocaleString()} non-archived trips. Monitoring, issues, truck counts and analytics use the latest {trips.length} loaded trips.</p>{snapshot.detailsLoading && <span role="status">Loading operational details...</span>}</div>
    {trips.some(trip => trip.demonstration) && <p className="home-bounded-note"><strong>Demonstration trip included.</strong> Trips marked Demo and their products, drivers, trucks and GPS samples are demonstration data. Headline totals include that saved trip; its map marker is labeled Demo / Simulated GPS.</p>}
    {(snapshot.bookingUnavailable || snapshot.eventsUnavailable) && <div className="home-message home-message-warning" role="status"><CircleAlert size={16} aria-hidden="true"/><span>{snapshot.bookingUnavailable ? "Some truck, stop and route details could not be loaded. " : ""}{snapshot.eventsUnavailable ? "Some recorded trip events could not be loaded. " : ""}Monitoring and analytics may be incomplete; headline trip totals remain available.</span></div>}
    {snapshot.bookingLimited && <p className="home-bounded-note">Some truck and stop details fall outside the report snapshot. Progress covers recorded stops; assignment checks and timing comparisons omit cases that cannot be verified. Open Trips for the complete records.</p>}
    <motion.section {...entrance} transition={{ duration: 0.4, delay: animate ? 0.1 : 0 }} className="home-monitor-grid" aria-label="Live operational monitoring">
      <article className="home-monitor-feature" ref={map}><header className="home-monitor-header"><div><p className="home-eyebrow">01 / Operational monitoring</p><h2>From dispatch to delivery</h2><p>Saved routes, recorded milestones and available truck positions.</p><button type="button" className="home-link-light" onClick={() => navigate("monitoring")}>Open Dispatch Monitoring <ArrowUpRight size={14} aria-hidden="true"/></button></div><TruckJourneyIllustration/></header><div className="home-map-surface">{mapData.tracks.length ? <LiveTripMap dashboard onRoadSelection={setSelectedRoad} onRoadRows={setRoadRows} tracks={mapData.tracks} locationIds={mapData.locationIds} tripLocationRoutes={mapData.routes} focusTripId={focused} eventLoadError={snapshot.eventsUnavailable} height={400} demo={false}/> : <EmptyState title="No active trips to map" icon={MapPinned}>Recorded routes and positions appear here when active trips are available.</EmptyState>}</div><div className="home-map-caption"><span><i/>Saved routes and recorded GPS</span>{focused && <button type="button" onClick={() => setFocus(null)}>Clear focused trip</button>}</div></article>
      <TruckerUpdates snapshot={snapshot} trips={trips} roads={roadRows} selected={selectedRoad} active={active} onOpenTrip={onOpenTrip}/>
    </motion.section>
    <div ref={board} className="home-board-anchor"><HomeTripTable trips={trips} filter={filter} onFilter={setFilter} focusedTrip={focused} onFocus={id => { setFocus(id === focused ? null : id); map.current?.scrollIntoView({ behavior: animate ? "smooth" : "instant", block: "start" }); }} onOpenTrip={onOpenTrip} photos={snapshot.photoUrls} detailsLoading={snapshot.detailsLoading} total={snapshot.total} onViewAll={() => navigate("combined")}/></div>
    <HomeAnalytics data={analytics} days={days} onDays={setDays} animate={animate} detailsLoading={snapshot.detailsLoading} detailsUnavailable={snapshot.bookingUnavailable || snapshot.eventsUnavailable || snapshot.bookingLimited}/>
    <div className="home-secondary-totals"><span><strong>{snapshot.planned}</strong> pending dispatches</span><span><strong>{snapshot.completed}</strong> completed trips</span><span><strong>{analytics.truckCount}</strong> assigned trucks in loaded active trips</span></div>
    {attention.length>0&&<div className="home-secondary-attention"><aside className="home-panel home-priority-panel"><SectionHeading title="Attention desk" description="Review the exceptions before the next dispatch."><span className="home-count-badge">{attention.length}</span></SectionHeading>
        {attention.length ? <ol className="home-priority-list">{attention.slice(0, 4).map(trip => <li key={trip.id}><button type="button" onClick={() => onOpenTrip?.(trip.id)}><span className="home-priority-icon"><CircleAlert size={17} aria-hidden="true"/></span><span><strong>{trip.reference}</strong><small>{trip.issue}</small><span>{trip.origin} → {trip.destination}</span></span><ArrowUpRight size={14} aria-hidden="true"/></button></li>)}</ol> : <EmptyState title={snapshot.detailsLoading ? "Checking operational details" : "No exceptions in the loaded trips"} icon={ShieldCheck}>{snapshot.detailsLoading ? "Assignment checks appear after the detail read finishes." : "Overdue estimates and missing active-trip assignments are checked here."}</EmptyState>}
        {attention.length > 4 && <button type="button" className="home-text-button home-view-exceptions" onClick={() => revealBoard("All")}>Review all {attention.length} flagged trips <ArrowRight size={14} aria-hidden="true"/></button>}
        <div className="home-priority-bottom"><div><Truck size={18} aria-hidden="true"/><strong>{snapshot.bookingUnavailable || snapshot.detailsLoading && !analytics.assigned ? "—" : analytics.assigned}<span> / {analytics.active}</span></strong><small>loaded active trips have a truck recorded</small></div><button type="button" className="home-text-button" onClick={() => navigate("truckers")}>Manage assignments <ArrowUpRight size={14} aria-hidden="true"/></button></div>
      </aside></div>}
    <section className="home-support-section" aria-label="Supporting operations"><SectionHeading eyebrow="04 / Stay in the loop" title="Your next move" description="Recent field activity, upcoming dates, and shortcuts to the right workspace."/>
      <div className="home-support-grid"><article className="home-panel home-activity-panel"><SectionHeading title="Latest from the field"><Activity size={17} aria-hidden="true"/></SectionHeading>{events.length ? <ol className="home-activity-list">{events.map(event => <li key={`${event.trip_id}:${event.id}`}><i aria-hidden="true"/><div><button type="button" onClick={() => onOpenTrip?.(event.trip_id)}>{event.dispatch_number}<ArrowUpRight size={12} aria-hidden="true"/></button><p>{trips.find(trip=>trip.id===event.trip_id)?.demonstration&&<span className="home-demo-label">Demonstration event</span>}{event.event_type.toLowerCase().replaceAll("_", " ")}</p>{event.notes && <span>{event.notes}</span>}<time dateTime={event.event_time}>{new Date(event.event_time).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" })} PHT</time></div></li>)}</ol> : <EmptyState title={snapshot.detailsLoading ? "Loading field updates" : "No recorded activity available"} icon={Activity}>Only saved operational events appear in this feed.</EmptyState>}</article>
        <div className="home-calendar"><OverviewMiniCalendar markedDates={deliveryDates} markedLabel="estimated deliveries in loaded trips" onOpenCalendar={() => navigate("calendar")}/></div>
        <aside className="home-panel home-actions-panel"><SectionHeading title="Workspace shortcuts"/><nav aria-label="Dashboard quick actions">{[{ label: "Plan a dispatch", note: "Bookings and destinations", icon: ClipboardList, target: "trip-booking" }, { label: "Monitor deliveries", note: "Milestones and exceptions", icon: MapPinned, target: "monitoring" }, { label: "Delivery calendar", note: "Schedules and upcoming dates", icon: CalendarDays, target: "calendar" }, { label: "Billing & payables", note: "Open the billing workspace", icon: WalletCards, target: "payables" }].map(({ label, note, icon: Icon, target }) => <button type="button" key={label} onClick={() => navigate(target)}><Icon size={18} aria-hidden="true"/><span><strong>{label}</strong><small>{note}</small></span><ArrowUpRight size={14} aria-hidden="true"/></button>)}</nav><div className="home-request-note"><p>{requests.source === "live" ? `${requests.pending.length} pending dispatch requests` : "Dispatch request automation is not connected to live data."}</p><button type="button" className="home-text-button" onClick={() => { if (requests.source === "live" && requests.pending[0]) requests.select(requests.pending[0].id); navigate("requests"); }}>Open requests <ArrowRight size={13} aria-hidden="true"/></button></div></aside>
      </div>
    </section>
    <footer className="home-page-footer"><span>ALZHEN TMS / Operations workspace</span><span>Philippine time · {shortDay(manilaDay(new Date().toISOString()))}</span></footer>
  </div></MotionConfig>;
}
