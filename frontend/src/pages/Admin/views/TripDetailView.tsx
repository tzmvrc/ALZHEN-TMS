import {useWorkspaceTripLabel} from "../../../components/admin/WorkspaceTripLabel";
import {motion,useReducedMotion} from "motion/react";
import TripTrackingWorkspace from "../../../components/admin/TripTrackingWorkspace";
import { useDeferredRealtimeRefresh } from "../../../components/admin/useDeferredRealtimeRefresh";
import { lazy,Suspense,useEffect,useLayoutEffect,useMemo,useRef, useState } from "react";
import type {TripRecordTarget} from '../../../components/admin/TripDeliveryOperations';
import {ArrowLeft} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ApiError,getCachedApiResponse,cacheApiSnapshot,apiCacheGeneration } from "../../../services/api.service";
import {
  fetchTripDetail,
  fetchTripAssignments,
  fetchTripEvents,
  fetchTripLineItems,
  fetchTripStops,
  invalidateTripCache,
  type TripChildRecord,
  type TripAssignmentRecord,
  type TripEvent,
  type TripRecord,
} from "../../../services/trip.service";
import { surface } from "../../../components/admin/dashboardStyles";
import TripWorkspaceDialog from "../../../components/admin/TripWorkspaceDialog";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import {
  fetchTripOperations,
  type OperationsReportData,
} from "../../../services/operations-report.service";

const TripMasterList=lazy(()=>import("../../../components/admin/ReportDataView"));
const TripDocumentsWorkspace=lazy(()=>import("../../../components/admin/TripDocumentsWorkspace"));

type DetailState = {
  trip: TripRecord;
  assignments: TripAssignmentRecord[];
  assignmentsReady?: boolean;
  stops: TripChildRecord[];
  lineItems: TripChildRecord[];
  events: TripEvent[];
  operations: OperationsReportData;
  bookingRows: Record<string, unknown>[];
  bookingError: string | null;
  sectionErrors: string[];
};



/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function valueText(value: unknown, fallback = "Not recorded"): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getBookingValue(
  bookingRows: Record<string, unknown>[],
  key: string,
  fallback = "Not recorded",
): string {
  const value = bookingRows.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
  return valueText(value, fallback);
}

function sumOf(rows: Record<string, unknown>[], key: string): number {
  return rows.reduce((total, row) => {
    const n = Number(row[key]);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}

function stopIsDone(stop: TripChildRecord): boolean {
  return (
    /COMPLET|DELIVER|FINISH/i.test(String(stop.delivery_status ?? "")) ||
    Boolean(stop.departure_time)
  );
}

function TripDetailSkeleton({ onBack }: { onBack: () => void }) {
  const block = "animate-pulse rounded-3xl bg-slate-200/80";

  return (
    <div aria-label="Loading trip details" aria-busy="true" className="w-full space-y-4">
      <header className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-4 text-xs font-semibold text-[#0b2341] shadow-sm">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to trips
        </button>
      </header>

      <section aria-hidden="true" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <div key={index} className={`${block} h-24`} />)}
      </section>

      <section aria-hidden="true" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-5">
          <div className={`${block} min-h-[260px]`} />
          <div className={`${block} min-h-[300px]`} />
        </div>
        <div className={`${block} min-h-[560px] xl:col-span-7`} />
        <div className={`${block} min-h-[240px] xl:col-span-7`} />
        <div className={`${block} min-h-[240px] xl:col-span-5`} />
      </section>

      <section aria-hidden="true" className={`${block} min-h-[260px]`} />
      <span className="sr-only">Loading trip details</span>
    </div>
  );
}

export default function TripDetailView({
  tripId,
  onBack,
}: {
  tripId: string;
  onBack: () => void;
  initialStopId?: string | null;
}) {
  const reduced=useReducedMotion();
  const { accessToken, refreshSession } = useAuth();
  const navigate = useNavigate();
  const snapshotEndpoint=`/trips/${encodeURIComponent(tripId)}/screen-snapshot`;
  const scope=`${accessToken}:${tripId}`;
  const cachedDetail=accessToken?getCachedApiResponse<DetailState>(snapshotEndpoint,accessToken,5*60_000):null;
  const [detailState,setDetailState]=useState(()=>({scope,value:cachedDetail}));
  const detail=detailState.scope===scope?detailState.value:cachedDetail;
  const previousDetail=useRef({scope,value:detail});
  useLayoutEffect(()=>{previousDetail.current={scope,value:detail};},[scope,detail]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [library,setLibrary]=useState<'records'|'operations'|null>(null);
  const openReportSection=(target:TripRecordTarget)=>{
    if(target==='records'){setLibrary('records');return;}
    if(target==='receipts'){document.getElementById(`trip-${tripId}-pod`)?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(target==='operations'){setLibrary('operations');return;}
    const node=document.getElementById(`trip-${tripId}-${target}`);
    if(!node)return;
    if(node instanceof HTMLDetailsElement)node.open=true;
    let parent=node.parentElement;while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}
    requestAnimationFrame(()=>{node.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});node.focus({preventScroll:true});});
  };
  const requestKey = `${accessToken ?? "no-session"}:${tripId}:${retry}`;
  const realtimeGate = useDeferredRealtimeRefresh(() => { invalidateTripCache(tripId); setRetry((value) => value + 1); }, false);

  useEffect(() => subscribeToAdminRealtime((event) => {
    if (event.kind === "batch") {
      if (event.tables.some((table) => ["trips", "trip_stops", "trip_line_items", "trip_truck_assignments", "billings", "customers", "customer_stores", "warehouses", "drivers", "trucks", "trucking_companies"].includes(table))) {
        realtimeGate.request();
      }
      return;
    }
    if (event.kind === "resume") {
      realtimeGate.request();

      return;
    }
    const tripTables = ["trips", "trip_stops", "trip_line_items", "trip_truck_assignments", "billings"];
    if (event.kind === "recovered") {
      if (!tripTables.includes(event.table)) return;
    } else {
      const { table, new: next, old } = event.payload;
      if (!tripTables.includes(table)) return;
      const relatedId = table === "trips"
        ? [next?.id, old?.id].find((value) => typeof value === "string")
        : [next?.trip_id, old?.trip_id].find((value) => typeof value === "string");
      if (relatedId !== tripId) return;
    }
    realtimeGate.request();
  }), [tripId, realtimeGate]);


  useEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;
    const generation=apiCacheGeneration();
    void (async () => {
      try {
        // Start the small selector read alongside the core trip request. Capture
        // rejection immediately while the authorized trip response is pending.
        const assignmentRead = fetchTripAssignments(accessToken, tripId).then(
          value => ({ status: 'fulfilled' as const, value }),
          reason => ({ status: 'rejected' as const, reason }),
        );
        const tripResponse = await fetchTripDetail(accessToken, tripId);
        if(!active)return;
        const cached=previousDetail.current.scope===scope?previousDetail.current.value:null;
        // Render authorized core data without waiting for optional section/report reads.
        setDetailState({scope,value:{stops:[],lineItems:[],assignments:[],events:[],operations:{trips:[],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],event_rows:[]},bookingRows:[],bookingError:null,sectionErrors:[],...cached,trip:{...tripResponse.trip,warehouse_name:tripResponse.warehouse?.name,warehouse_code:tripResponse.warehouse?.code,trip_type:tripResponse.trip_type?.name}}});
        const [stopsResult, itemsResult, assignmentsResult, eventsResult, operationsResult] = await Promise.allSettled([
          fetchTripStops(accessToken, tripId),
          fetchTripLineItems(accessToken, tripId),
          assignmentRead.then(result => {
            if (result.status === 'rejected') throw result.reason;
            // Publish independently of cargo, events and operational reports.
            if (active) setDetailState(current => current.scope === scope && current.value
              ? { ...current, value: { ...current.value, assignments: result.value, assignmentsReady: true } }
              : current);
            return result.value;
          }),
          fetchTripEvents(accessToken, tripId),
          fetchTripOperations(accessToken, tripId, "metadata"),
        ]);
        const childResults = [stopsResult, itemsResult, assignmentsResult, eventsResult, operationsResult];
        const authFailure = childResults.find(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof ApiError &&
            result.reason.status === 401,
        );
        if (authFailure?.status === "rejected") throw authFailure.reason;
        const previous=previousDetail.current.scope===scope?previousDetail.current.value:null;
        const stops = stopsResult.status === "fulfilled" ? stopsResult.value : previous?.stops??[];
        const lineItems = itemsResult.status === "fulfilled" ? itemsResult.value : previous?.lineItems??[];
        const assignments = assignmentsResult.status === "fulfilled" ? assignmentsResult.value : previous?.assignments??[];
        const events = eventsResult.status === "fulfilled" ? eventsResult.value : previous?.events??[];
        const operations = operationsResult.status === "fulfilled" ? operationsResult.value : previous?.operations??{
          trips: [], trip_options: [], stops: [], loading: [], unloading: [], backloads: [], offloads: [], event_rows: [],
        };
        const sectionErrors = childResults.flatMap((result, index) => {
          if (result.status !== "rejected") return [];
          const sections = ["Stops", "Products", "Trucks", "Events", "Operational reports"];
          const message = result.reason instanceof Error ? result.reason.message : "Unavailable";
          return [`${sections[index]}: ${message}`];
        });
        const bookingRows=previous?.bookingRows??[];
        const bookingError=null;
        if (!active) return;
        const nextDetail:DetailState={
          trip: {
            ...tripResponse.trip,
            warehouse_name: tripResponse.warehouse?.name,
            warehouse_code: tripResponse.warehouse?.code,
            trip_type: tripResponse.trip_type?.name,
          },
          assignments,
          assignmentsReady: assignmentsResult.status === 'fulfilled' || previous?.assignmentsReady,
          stops,
          lineItems,
          events,
          operations,
          bookingRows,
          bookingError,
          sectionErrors,
        };
        cacheApiSnapshot(snapshotEndpoint,accessToken,nextDetail,generation);
        setDetailState({scope,value:nextDetail});
      } catch (cause) {
        if (!active) return;
        if(cause instanceof ApiError&&[403,404].includes(cause.status)){invalidateTripCache(tripId);setDetailState({scope,value:null});}
        if (cause instanceof ApiError && cause.status === 401) {
          await refreshSession();
          return;
        }
        setFailure({
          key: requestKey,
          message:
            cause instanceof ApiError && cause.status === 403
              ? "You are not authorized to view this trip."
              : cause instanceof Error
                ? cause.message
                : "Unable to load trip details.",
        });
      } finally {
        if (active) setLoadedKey(requestKey);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, navigate, refreshSession, requestKey, tripId,snapshotEndpoint,scope]);

  const isLoading = Boolean(accessToken) && loadedKey !== requestKey;
  const error = failure?.key === requestKey ? failure.message : null;
  const orderedEvents = useMemo(()=>(detail?.events ?? []).slice().sort((a,b)=>Date.parse(a.event_time)-Date.parse(b.event_time)),[detail?.events]);

  useWorkspaceTripLabel(tripId,detail?.trip?.dispatch_number);

  if (error&&!detail) {
    return (
      <div className={`${surface.card} flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center`}>
        <p role="alert" className="text-sm text-rose-700">{error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className={surface.chipGhost}>Back to trips</button>
          <button type="button" onClick={() => setRetry((current) => current + 1)} className={surface.chip}>Retry</button>
        </div>
      </div>
    );
  }

  if (isLoading && !detail) return <TripDetailSkeleton onBack={onBack} />;

  const trip = detail?.trip;
  const dispatchNumber = String(trip?.dispatch_number ?? "Trip details");
  const stops = detail?.stops ?? [];
  const assignments = detail?.assignments ?? [];
  const bookingRows = detail?.bookingRows ?? [];
  // Keep saved cargo visible even when report enrichment is unavailable. Join by
  // line item identity so multiple items at the same stop stay separate.
  const productRows: Record<string, unknown>[] = detail?.lineItems.length
    ? detail.lineItems.map((item) => ({
        ...bookingRows.find((row) => String(row.trip_line_item_id ?? row._trip_line_item_id ?? "") === String(item.id)),
        ...item,
        trip_line_item_id: item.id,
      }))
    : [...new Map(bookingRows.filter((row) => row.trip_line_item_id || row._trip_line_item_id).map(row=>[String(row.trip_line_item_id??row._trip_line_item_id),row])).values()];
  const reportRows = bookingRows;
  const destinationNames = [
    ...new Set(reportRows.map((row) => String(row.store_name ?? "")).filter(Boolean)),
  ];
  const originName = getBookingValue(
    reportRows,
    "warehouse_name",
    getBookingValue(reportRows, "warehouse_code", valueText(trip?.warehouse_name ?? trip?.warehouse_code, "Origin not recorded")),
  );
  const destinationText = destinationNames.length
    ? destinationNames.join(", ")
    : "Store destinations not available";

  const doneStops = stops.filter(stopIsDone).length;
  const progress = stops.length ? Math.round((doneStops / stops.length) * 100) : 0;
  const cargoRows = productRows;
  // Aggregate from the trip_line_items endpoint directly. Flattened report
  // views can repeat a line when other one-to-many relations are joined.
  const totalQty = detail?.lineItems.length ? sumOf(detail.lineItems, "quantity") : sumOf(cargoRows, "quantity");
  const totalCbm = detail?.lineItems.length ? sumOf(detail.lineItems, "cbm") : sumOf(cargoRows, "cbm");


  return (
    <motion.div initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.25}} className="trip-detail-page">
      {isLoading&&detail&&<p role="status" className="sr-only">Loading remaining trip details…</p>}
      {error&&detail&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error} Previous trip data is retained. <button type="button" className="underline" onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-4 text-xs font-semibold text-[#0b2341] shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to trips
        </button>

      </header>

      {detail && detail.sectionErrors.length > 0 && (
        <p role="status" className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Some sections could not be loaded: {detail.sectionErrors.join(" · ")}
        </p>
      )}
      {detail?.bookingError && (
        <p role="status" className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Some product, store, and vehicle details could not be loaded: {detail.bookingError}
          <button type="button" className="ml-2 underline" onClick={() => setRetry((current) => current + 1)}>Retry</button>
        </p>
      )}

      {trip&&<TripTrackingWorkspace trip={trip} assignments={assignments} assignmentsLoading={!detail?.assignmentsReady&&isLoading} stops={stops} events={orderedEvents} origin={originName} destination={destinationText} progress={progress} totalCbm={totalCbm} totalQty={totalQty} refreshKey={retry} loading={isLoading} operations={detail?.operations??null} bookingRows={bookingRows} operationsError={detail?.sectionErrors.find(message=>message.startsWith('Operational reports:'))} onOpenReport={openReportSection}/>}
      {library==='operations'&&<TripWorkspaceDialog title="Manage reports" description="Only this trip?s records, with every Master List column and the same editing tools." dispatchNumber={dispatchNumber} tripReference={String(trip?.trip_reference||tripId)} onClose={()=>setLibrary(null)}><div className="trip-management-master"><Suspense fallback={<p className="trip-management-empty" role="status">Loading Master List spreadsheet...</p>}><TripMasterList key={tripId} initialReport="dispatch-monitoring" transactionView allTripRecords tripScope={tripId} topbarSearchScope={`trip-management:${tripId}`} showReportPicker={false} showExport={false} onOpenTrip={()=>setLibrary(null)}/></Suspense></div></TripWorkspaceDialog>}

      {library==='records'&&accessToken&&<Suspense fallback={<p role="status">Loading trip documents...</p>}><TripDocumentsWorkspace key={tripId} token={accessToken} tripId={tripId} tripReference={String(trip?.trip_reference||tripId)} dispatchNumber={dispatchNumber} assignments={assignments} onClose={()=>setLibrary(null)}/></Suspense>}
    </motion.div>
  );
}
