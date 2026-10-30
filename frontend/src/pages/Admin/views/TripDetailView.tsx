import {useWorkspaceTripLabel} from "../../../components/admin/WorkspaceTripLabel";
import ImagePreview from '../../../components/ui/ImagePreview';
import {motion,useReducedMotion} from "motion/react";
import TripTrackingWorkspace from "../../../components/admin/TripTrackingWorkspace";
import TripConvoyPanel from "../../../components/admin/TripConvoyPanel";
import { useDeferredRealtimeRefresh } from "../../../components/admin/useDeferredRealtimeRefresh";
import { lazy,Suspense,useEffect,useLayoutEffect,useMemo,useRef, useState, type ReactNode } from "react";
import type {TripRecordTarget} from '../../../components/admin/TripDeliveryOperations';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  ImagePlus,
  Images,
  Package,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ApiError, apiGetCached,getCachedApiResponse,cacheApiSnapshot,apiCacheGeneration,type ApiResponse } from "../../../services/api.service";
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
import ProductPhotoManager from "../../../components/admin/ProductPhotoManager";
import TripWorkspaceDialog from "../../../components/admin/TripWorkspaceDialog";
import {
  deleteTripImage,
  fetchTripImages,
  invalidateTripImagesCache,
  uploadTripImage,
  type TripImage,
} from "../../../services/trip-image.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import {
  fetchTripOperations,
  type OperationsReportData,
} from "../../../services/operations-report.service";

const OperationsReportsView=lazy(()=>import("../../../components/admin/OperationsReportsView"));

type BookingPage = {
  rows: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

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

function dateText(value: unknown, includeTime = false): string {
  if (typeof value !== "string" || !value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
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

const formatNumber = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function statusTone(status: unknown) {
  const s = String(status ?? "").toUpperCase();
  if (/COMPLET|DELIVER|FINISH/.test(s))
    return { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  if (/DELAY/.test(s)) return { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  if (/CANCEL|FAIL/.test(s)) return { pill: "bg-rose-50 text-rose-700", dot: "bg-rose-500" };
  if (/PROGRESS|TRANSIT|LOAD|ONGOING|DISPATCH/.test(s))
    return { pill: "bg-[#e6f0f9] text-[#1d5f94]", dot: "bg-[#2678b9]" };
  return { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
}

function StatusPill({
  status,
  fallback = "Not recorded",
  onDark = false,
}: {
  status: unknown;
  fallback?: string;
  onDark?: boolean;
}) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
        onDark ? "bg-white/10 text-white ring-1 ring-inset ring-white/20" : tone.pill
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {valueText(status, fallback).replaceAll("_", " ")}
    </span>
  );
}

function stopIsDone(stop: TripChildRecord): boolean {
  return (
    /COMPLET|DELIVER|FINISH/i.test(String(stop.delivery_status ?? "")) ||
    Boolean(stop.departure_time)
  );
}

/* ------------------------------------------------------------------ */
/* Card building blocks                                                */
/* ------------------------------------------------------------------ */
function CardHeader({
  icon,
  title,
  right,
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[#2678b9] [&>svg]:h-4 [&>svg]:w-4"
        >
          {icon}
        </span>
        <h3 className="truncate text-sm font-semibold text-[#0b2341]">{title}</h3>
      </div>
      {right}
    </header>
  );
}

function ProductPhotoThumb({ src, className = "h-14 w-14" }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <Package aria-hidden="true" className="h-5 w-5 text-slate-300" />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${className} rounded-xl bg-[#f2f6fa] object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Photo gallery                                                       */
/* ------------------------------------------------------------------ */
function TripGallery({
  plate,
  tripId,
  accessToken,
}: {
  plate: string;
  tripId: string;
  accessToken: string | null;
}) {
  const [savedPhotos, setSavedPhotos] = useState<TripImage[] | null>(null);
  const [active, setActive] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [previewOpen,setPreviewOpen]=useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [imageRefreshVersion, setImageRefreshVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const photos = savedPhotos ?? [];
  const activeSavedPhoto = photos[active];

  useEffect(() => {
    if (!accessToken) return;
    let current = true;
    void fetchTripImages(accessToken, tripId).then(
      (images) => {
        if (!current) return;
        setSavedPhotos(images);
        setActive((index) => Math.min(index, Math.max(images.length - 1, 0)));
        setPhotoError(null);
      },
      (cause: unknown) => {
        if (!current) return;
        setSavedPhotos([]);
        setPhotoError(cause instanceof Error ? cause.message : "Unable to load saved trip photos.");
      },
    );
    return () => {
      current = false;
    };
  }, [accessToken, imageRefreshVersion, tripId]);

  useEffect(() => subscribeToAdminRealtime((event) => {
    const refresh = () => {
      invalidateTripImagesCache(tripId);

      setImageRefreshVersion((version) => version + 1);
    };
    if (event.kind === "batch") { if (event.tables.includes("trip_images")) refresh(); return; }
    if (event.kind === "resume") {
      refresh();
      return;
    }
    if (event.kind === "recovered") {
      if (event.table === "trip_images") refresh();
      return;
    }
    if (event.payload.table === "trip_images" && [event.payload.new?.trip_id, event.payload.old?.trip_id].includes(tripId)) {
      refresh();
    }
  }), [tripId]);

  const go = (step: number) => {
    if (photos.length < 2) return;
    setActive((current) => (current + step + photos.length) % photos.length);
  };
  const navBtn =
    "absolute top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0b2341] shadow-[0_2px_8px_rgba(11,35,65,0.18)] transition hover:bg-[#ffd43b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40";

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !accessToken) return;
    const selectedFiles = Array.from(files);
    const previousCount = photos.length;
    setPhotoBusy(true);
    setPhotoError(null);
    let uploaded = 0;
    try {
      for (const file of selectedFiles) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        ) {
          throw new Error("Choose JPEG, PNG, or WebP photos up to 5 MB each.");
        }
        const saved = await uploadTripImage(accessToken, tripId, file);
        setSavedPhotos((current) => [...(current ?? []), saved]);
        uploaded += 1;
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to upload trip photo.";
      setPhotoError(
        uploaded > 0
          ? `${message} ${uploaded} photo${uploaded === 1 ? "" : "s"} were saved.`
          : message,
      );
    } finally {
      if (uploaded > 0) setActive(previousCount + uploaded - 1);
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeActivePhoto = async () => {
    if (!activeSavedPhoto || !accessToken || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await deleteTripImage(accessToken, tripId, activeSavedPhoto.id);
      setSavedPhotos((current) => (current ?? []).filter((photo) => photo.id !== activeSavedPhoto.id));
      setActive((current) => Math.max(0, Math.min(current, photos.length - 2)));
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : "Unable to delete trip photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div aria-busy={photoBusy||undefined} className={`${surface.card} flex flex-col p-5`}>
      <CardHeader
        icon={<Images />}
        title="Trip photos"
        right={
          photos.length > 0 ? (
            <label
              className={`${surface.chip} ${photoBusy || !accessToken ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
            >
              <ImagePlus aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              {photoBusy ? "Saving…" : "Add"}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={photoBusy || !accessToken}
                className="sr-only"
                onChange={(event) => void uploadPhotos(event.target.files)}
              />
            </label>
          ) : undefined
        }
      />
      <div className={`relative mt-4 overflow-hidden rounded-2xl bg-slate-100 ${photos.length > 0 ? "aspect-[16/10]" : "min-h-[8rem] flex-1"}`}>
        {photos.length > 0 ? (
          <>
            <button type="button" className="h-full w-full cursor-zoom-in" aria-label="Enlarge trip photo" onClick={()=>setPreviewOpen(true)}><img
              key={photos[active]?.id}
              src={photos[active]?.signed_url}
              alt={`Truck photo ${active + 1} of ${photos.length}`}
              className="h-full w-full object-cover"
            /></button>
            {photos.length > 1 && (
              <>
                <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className={`${navBtn} left-3`}>
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Next photo" onClick={() => go(1)} className={`${navBtn} right-3`}>
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </>
            )}
            {activeSavedPhoto && (
              <button
                type="button"
                aria-label="Delete saved photo"
                title="Delete saved photo"
                disabled={photoBusy}
                onClick={() => void removeActivePhoto()}
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-rose-600 shadow transition hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-[#0b2341]/90 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              <Truck aria-hidden="true" className="h-3.5 w-3.5 text-[#ffd43b]" />
              {plate}
            </span>
            <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#0b2341]">
              {active + 1} / {photos.length}
            </span>
          </>
        ) : (
          <label
            className={`flex h-full cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 px-6 text-center transition hover:border-[#2678b9] hover:bg-[#e6f0f9]/40 ${photoBusy || !accessToken ? "pointer-events-none opacity-60" : ""}`}
          >
            <ImagePlus aria-hidden="true" className="h-8 w-8 text-[#2678b9]" />
            <span className="text-sm font-semibold text-[#0b2341]">
              {photoBusy ? "Saving photo…" : savedPhotos === null ? "Loading trip photos…" : "Upload a trip photo"}
            </span>
            <span className="text-xs text-slate-500">Choose a JPEG, PNG, or WebP image</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={photoBusy || !accessToken}
              className="sr-only"
              onChange={(event) => void uploadPhotos(event.target.files)}
            />
          </label>
        )}
      </div>
      {photos.length > 1 && (
        <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1" role="group" aria-label="Truck photos">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              aria-label={`Show photo ${index + 1}`}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
              style={{ flex: "0 0 calc((100% - 1.5rem) / 4)" }}
              className={`aspect-[4/3] snap-start overflow-hidden rounded-xl bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 ${
                index === active ? "ring-2 ring-[#ffd43b] ring-offset-2" : "opacity-60 hover:opacity-100"
              }`}
            >
              <img src={photo.signed_url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {previewOpen&&activeSavedPhoto&&<ImagePreview key={activeSavedPhoto.id} file={{id:activeSavedPhoto.id,file_name:activeSavedPhoto.file_name,url:activeSavedPhoto.signed_url}} onClose={()=>setPreviewOpen(false)} onPrevious={photos.length>1?()=>go(-1):undefined} onNext={photos.length>1?()=>go(1):undefined}/>}
      <p className="mt-3 text-[10px] text-slate-400">JPEG, PNG, or WebP · up to 5 MB each</p>
      {photoError && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {photoError}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bento building blocks                                               */
/* ------------------------------------------------------------------ */
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
  initialStopId,
}: {
  tripId: string;
  onBack: () => void;
  initialStopId?: string | null;
}) {
  const reduced=useReducedMotion();
  const { accessToken, refreshSession } = useAuth();
  const [convoyOpen,setConvoyOpen]=useState(false);
  const [convoyInitial,setConvoyInitial]=useState<string|undefined>();
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
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [stopSelectionChanged, setStopSelectionChanged] = useState(false);
  const [library,setLibrary]=useState<'records'|'receipts'|'operations'|null>(null);
  const [photoProduct, setPhotoProduct] = useState<{ id: string; name: string } | null>(null);
  const [viewProduct, setViewProduct] = useState<Record<string, unknown> | null>(null);
  const [productPhotoOverrides, setProductPhotoOverrides] = useState<Record<string, string | null>>({});
  const [sidePanel, setSidePanel] = useState<"trucks" | "products" | "stops">("trucks");
  const openReportSection=(target:TripRecordTarget)=>{
    if(target==='records'){setSidePanel('products');setLibrary('records');return;}
    if(target==='receipts'){document.getElementById(`trip-${tripId}-pod`)?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(target==='operations'){setLibrary('operations');return;}
    const node=document.getElementById(`trip-${tripId}-${target}`);
    if(!node)return;
    if(node instanceof HTMLDetailsElement)node.open=true;
    let parent=node.parentElement;while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}
    requestAnimationFrame(()=>{node.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});node.focus({preventScroll:true});});
  };
  const requestKey = `${accessToken ?? "no-session"}:${tripId}:${retry}`;
  const realtimeGate = useDeferredRealtimeRefresh(() => { invalidateTripCache(tripId); setRetry((value) => value + 1); }, Boolean(photoProduct || viewProduct));

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

  useEffect(()=>{
    if(!accessToken||library!=='records')return;
    let active=true;
    void (async()=>{
      const params=new URLSearchParams({page:'1',limit:'500',trip_id:tripId,sort_by:'loading_date',sort_order:'desc'});
      try{
        const read=async()=>{const result=await apiGetCached<ApiResponse<BookingPage>>(`/reports/trip-booking?${params}`,accessToken,undefined,undefined,20000);if(!result.success||!result.data)throw Error(result.message??'Trip report enrichment unavailable.');return result.data;};
        const first=await read(),rows=[...first.rows];
        for(let page=2;page<=first.pagination.totalPages;page++){if(!active)return;params.set('page',String(page));rows.push(...(await read()).rows);}
        if(active)setDetailState(current=>current.scope===scope&&current.value?{...current,value:{...current.value,bookingRows:rows,bookingError:null}}:current);
      }catch(error){if(active)setDetailState(current=>current.scope===scope&&current.value?{...current,value:{...current.value,bookingError:error instanceof Error?error.message:'Trip report enrichment unavailable.'}}:current);}
    })();return()=>{active=false;};
  },[accessToken,tripId,scope,library,retry]);

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
  const initialStopIndex = initialStopId ? stops.findIndex((stop) => String(stop.id ?? "") === initialStopId) : -1;
  const activeStopId = stopSelectionChanged
    ? selectedStop
    : initialStopIndex >= 0
      ? String(stops[initialStopIndex].id ?? "")
      : selectedStop;
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

  const stopKey = (stop: TripChildRecord, index: number) => String(stop.stop_sequence ?? index + 1);
  const rowsForStop = (stopId: string) =>
    reportRows.filter((row) => String(row.trip_stop_id ?? row._trip_stop_id ?? "") === stopId);
  const visibleRows = activeStopId
    ? productRows.filter((row) => String(row.trip_stop_id ?? row._trip_stop_id ?? "") === activeStopId)
    : productRows;

  const stopLabels = Object.fromEntries(
    stops.map((stop, index) => [
      String(stop.id ?? ""),
      `Stop ${stopKey(stop, index)} · ${valueText(rowsForStop(String(stop.id ?? ""))[0]?.store_name, "Store not recorded")}`,
    ]),
  );
  const doneStops = stops.filter(stopIsDone).length;
  const progress = stops.length ? Math.round((doneStops / stops.length) * 100) : 0;
  const cargoRows = productRows;
  // Aggregate from the trip_line_items endpoint directly. Flattened report
  // views can repeat a line when other one-to-many relations are joined.
  const totalQty = detail?.lineItems.length ? sumOf(detail.lineItems, "quantity") : sumOf(cargoRows, "quantity");
  const totalCbm = detail?.lineItems.length ? sumOf(detail.lineItems, "cbm") : sumOf(cargoRows, "cbm");
  const plate = getBookingValue(reportRows, "plate_number", "No plate recorded");
  const placeholder = isLoading&&!detail ? "…" : undefined;
  const nextStopIndex=stops.findIndex(stop=>!stopIsDone(stop));
  const sideTabs = [
    { key: "trucks" as const, label: "Trucks", count: assignments.length },
    { key: "products" as const, label: "Products", count: productRows.length },
    { key: "stops" as const, label: "Stops", count: stops.length },
  ];
  const photoFor = (row: Record<string, unknown>): string | null => {
    const id = String(row.product_id ?? row._product_id ?? "");
    if (Object.hasOwn(productPhotoOverrides, id)) return productPhotoOverrides[id];
    return typeof row.product_photo_url === "string" ? row.product_photo_url : null;
  };
  const stopItemCount = (stopId: string) =>
    productRows.filter((row) => String(row.trip_stop_id ?? row._trip_stop_id ?? "") === stopId).length;


  return (
    <motion.div initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.25}} className="trip-detail-page">
      {convoyOpen&&accessToken&&<TripConvoyPanel initialAssignmentId={convoyInitial} token={accessToken} tripId={tripId} onClose={()=>setConvoyOpen(false)}/>}
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

      {trip&&<TripTrackingWorkspace trip={trip} assignments={assignments} assignmentsLoading={!detail?.assignmentsReady&&isLoading} stops={stops} events={orderedEvents} origin={originName} destination={destinationText} progress={progress} totalCbm={totalCbm} totalQty={totalQty} onManage={id=>{setConvoyInitial(id);setConvoyOpen(true);}} refreshKey={retry} loading={isLoading} operations={detail?.operations??null} bookingRows={bookingRows} operationsError={detail?.sectionErrors.find(message=>message.startsWith('Operational reports:'))} onOpenReport={openReportSection}/>}
      {library==='operations'&&<TripWorkspaceDialog title="Trip reports" description="Review incidents, backloads, offloads, and other operational records." onClose={()=>setLibrary(null)}><p className="trip-empty-note">Reports are initially searched by this dispatch. Shared historical records retain their original scope.</p><Suspense fallback={<p role="status">Loading reports...</p>}><OperationsReportsView mode="management" initialSearch={dispatchNumber} onOpenTrip={(id,stopId)=>{setLibrary(null);const params=new URLSearchParams(id===tripId?window.location.search:'');params.delete('event');if(stopId)params.set('stop',stopId);navigate(`/trips/${encodeURIComponent(id)}${params.size?`?${params}`:''}`);}}/></Suspense></TripWorkspaceDialog>}

      {/* Products / stops / activity beside trip photos */}
      {library==='records'&&<TripWorkspaceDialog title="Photos & records" description="Browse this trip?s trucks, products, stops, and supporting photos." onClose={()=>setLibrary(null)}><section id={`trip-${tripId}-records`} className="trip-records-library" tabIndex={-1}>
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <section className={`${surface.card} flex max-h-[640px] min-w-0 flex-col p-4 xl:col-span-7`}>
          <div role="tablist" aria-label="Trucks, products and stops" className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-full bg-[#eef3f8] p-1">
            {sideTabs.map(({ key, label, count }) => {
              const isActive = sidePanel === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSidePanel(key)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-white text-[#0b2341] shadow-[0_2px_8px_-2px_rgba(11,35,65,0.2)]"
                      : "text-slate-500 hover:text-[#0b2341]"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${isActive ? "bg-[#0b2341] text-white" : "bg-white text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {sidePanel === "trucks" && (
            <div role="tabpanel" className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <button type="button" onClick={()=>setConvoyOpen(true)} className="mb-3 rounded border px-3 py-1.5 text-xs text-blue-800">Manage assignments / cargo allocations</button>
              {assignments.length === 0 ? (
                <p className="rounded-xl bg-[#f7f9fc] px-4 py-8 text-center text-sm text-slate-500">
                  {placeholder ?? "No trucks are assigned to this trip yet."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {assignments.map((assignment) => {
                    const truck = assignment.truck ?? {};
                    const driver = assignment.driver ?? {};
                    const company = assignment.trucking_company ?? {};
                    const plate = valueText(truck.plate_number, "Truck not recorded");
                    const capacity = Number(truck.capacity_cbm);
                    const driverLabel = [driver.first_name, driver.last_name]
                      .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
                      .join(" ");
                    const isActive = !assignment.unassigned_at;
                    return (
                      <li key={assignment.id} className="rounded-2xl border border-slate-200/80 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e6f0f9] text-[#2678b9]">
                              <Truck className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#0b2341]">{plate}</p>
                              <p className="truncate text-xs text-slate-500">
                                {valueText(truck.truck_type, "Truck type not recorded")}
                                {driverLabel ? ` · ${driverLabel}` : " · Driver not assigned"}
                              </p>
                            </div>
                          </div>
                          <StatusPill
                            status={isActive ? "ASSIGNED" : "UNASSIGNED"}
                            fallback="Assignment status unknown"
                          />
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                          <div className="rounded-xl bg-[#f7f9fc] px-3 py-2">
                            <dt className="text-slate-400">Capacity</dt>
                            <dd className="mt-0.5 font-semibold text-[#0b2341]">
                              {Number.isFinite(capacity) && capacity > 0 ? `${formatNumber(capacity)} CBM` : "Not recorded"}
                            </dd>
                          </div>
                          <div className="rounded-xl bg-[#f7f9fc] px-3 py-2">
                            <dt className="text-slate-400">Trucking company</dt>
                            <dd className="mt-0.5 truncate font-semibold text-[#0b2341]">
                              {valueText(company.name, "Not recorded")}
                            </dd>
                          </div>
                          <div className="rounded-xl bg-[#fff9e0] px-3 py-2 sm:col-span-1">
                            <dt className="text-[#8a7130]">Cargo allocation</dt>
                            <dd className="mt-0.5 font-semibold text-[#6b5300]"><button type="button" onClick={()=>{setConvoyInitial(assignment.id);setConvoyOpen(true);}} className="underline">Manage allocations</button></dd>
                          </div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {sidePanel === "products" && (
            <div role="tabpanel" className="mt-3 flex min-h-0 flex-1 flex-col">
              {activeStopId && (
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl bg-[#fff6d1] px-3 py-2 text-[11px] text-[#6b5300]">
                  <span className="min-w-0 truncate">Showing {stopLabels[activeStopId] ?? "selected stop"}</span>
                  <button
                    type="button"
                    onClick={() => { setStopSelectionChanged(true); setSelectedStop(null); }}
                    className="shrink-0 font-semibold underline"
                  >
                    Show all
                  </button>
                </div>
              )}
              {visibleRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  {placeholder ?? (activeStopId ? "No products recorded for this stop." : "No products recorded for this trip.")}
                </p>
              ) : (
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {visibleRows.map((row, index) => {
                    const productId = String(row.product_id ?? row._product_id ?? "");
                    const photoUrl = photoFor(row);
                    const productName = valueText(row.product_name, "Product not recorded");
                    const sku = row.sku ?? row.model_code;
                    return (
                      <li
                        key={String(row.trip_line_item_id ?? row.id ?? `${tripId}-panel-item-${index}`)}
                        className="flex items-center gap-3 rounded-2xl bg-[#f7f9fc] p-2.5"
                      >
                        <span className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                          <ProductPhotoThumb key={`${productId}:${photoUrl ?? "empty"}`} src={photoUrl} />
                          {productId && (
                            <button
                              type="button"
                              onClick={() => setPhotoProduct({ id: productId, name: productName })}
                              aria-label={`${photoUrl ? "Change" : "Upload"} photo for ${productName}`}
                              title={photoUrl ? "Change product photo" : "Upload product photo"}
                              className="invisible absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-[#0b2341]/65 text-[9px] font-semibold leading-none text-white opacity-0 transition hover:bg-[#0b2341]/75 focus-visible:visible focus-visible:opacity-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 [@media(hover:none)]:visible [@media(hover:none)]:opacity-100"
                            >
                              <ImagePlus aria-hidden="true" className="h-4 w-4" />
                              {photoUrl ? "Change" : "Upload"}
                            </button>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setViewProduct(row)}
                            aria-label={`View appliance details for ${productName}`}
                            className="block max-w-full truncate rounded text-left text-[13px] font-semibold text-[#0b2341] transition-colors hover:text-[#2678b9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
                          >
                            {productName}
                          </button>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {valueText(row.store_name, "Store not recorded")}
                            {row.dr_number ? ` · DR ${String(row.dr_number)}` : ""}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <StatusPill status={row.delivery_status} fallback="Pending" />
                            {sku ? <span className="truncate text-[10px] text-slate-400">{String(sku)}</span> : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-[#0b2341]">×{valueText(row.quantity, "—")}</p>
                          <p className="text-[11px] tabular-nums text-slate-500">{valueText(row.cbm, "—")} CBM</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {visibleRows.length > 0 && (
                <p className="mt-3 flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                  <Package aria-hidden="true" className="h-3.5 w-3.5 text-[#2678b9]" />
                  {visibleRows.length} {visibleRows.length === 1 ? "line" : "lines"} ·{" "}
                  {formatNumber(sumOf(visibleRows, "quantity"))} units · {formatNumber(sumOf(visibleRows, "cbm"))} CBM
                </p>
              )}
            </div>
          )}

          {sidePanel === "stops" &&
            (stops.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {placeholder ?? "No stops recorded for this trip."}
              </p>
            ) : (
              <ul role="tabpanel" className="mt-3 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto pr-1">
                {stops.map((stop, index) => {
                  const key = stopKey(stop, index);
                  const stopId = String(stop.id ?? "");
                  const match = rowsForStop(stopId)[0] ?? {};
                  const done = stopIsDone(stop);
                  const isNext = index === nextStopIndex;
                  const itemCount = stopItemCount(stopId);
                  return (
                    <li key={String(stop.id ?? stop.trip_stop_id ?? `${tripId}-${index}`)} className="flex items-start gap-3 py-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          done
                            ? "bg-emerald-500 text-white"
                            : isNext
                              ? "bg-[#ffd43b] text-[#0b2341]"
                              : "bg-[#e6f0f9] text-[#0b2341]"
                        }`}
                      >
                        {done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : key}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-[#0b2341]">
                            {valueText(match.store_name, valueText(stop.store_id, "Store not recorded"))}
                          </p>
                          {isNext && (
                            <span className="shrink-0 rounded-full bg-[#fff6d1] px-2 py-0.5 text-[10px] font-bold text-[#8a6a00]">Next</span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {valueText(match.customer_name, valueText(stop.customer_id, "Customer not recorded"))}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                            <Clock aria-hidden="true" className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {stop.arrival_time ? dateText(stop.arrival_time, true) : "No arrival yet"}
                            </span>
                          </span>
                          <StatusPill status={stop.delivery_status ?? match.delivery_status} fallback="Pending" />
                        </div>
                        {itemCount > 0 && stopId && (
                          <button
                            type="button"
                            onClick={() => {
                              setStopSelectionChanged(true);
                              setSelectedStop(stopId);
                              setSidePanel("products");
                            }}
                            className="mt-2 text-[11px] font-semibold text-[#2678b9] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
                          >
                            View {itemCount} {itemCount === 1 ? "product" : "products"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}


        </section>
        <div className="flex min-w-0 flex-col xl:col-span-5 [&>div]:flex-1">
          <TripGallery key={tripId} plate={plate} tripId={tripId} accessToken={accessToken} />
        </div>
      </div>
      {/* Delivery receipts (OCR text for admin review) */}

      </section></TripWorkspaceDialog>}

      {accessToken && photoProduct && (
        <ProductPhotoManager
          token={accessToken}
          productId={photoProduct.id}
          productLabel={photoProduct.name}
          onClose={() => setPhotoProduct(null)}
          onPhotoChange={(url) => {
            setProductPhotoOverrides((current) => ({ ...current, [photoProduct.id]: url }));
          }}
        />
      )}

      {viewProduct && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4 al-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewProduct(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="appliance-details-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <Eye aria-hidden="true" className="h-4 w-4 shrink-0 text-[#2678b9]" />
                <h3 id="appliance-details-title" className="truncate font-semibold text-[#0b2341]">
                  Appliance details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewProduct(null)}
                aria-label="Close appliance details"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>
            <div className="grid gap-4 p-5 sm:grid-cols-[120px_minmax(0,1fr)]">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-[#f2f6fa]">
                <ProductPhotoThumb
                  key={`${String(viewProduct.product_id ?? viewProduct._product_id ?? "")}:${String(viewProduct.product_photo_url ?? "")}`}
                  src={typeof viewProduct.product_photo_url === "string" ? viewProduct.product_photo_url : null}
                />
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-[#0b2341]">
                  {valueText(viewProduct.product_name, "Product not recorded")}
                </h4>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  {[
                    ["SKU / Model", viewProduct.sku ?? viewProduct.model_code],
                    ["Category", viewProduct.product_category ?? viewProduct.category],
                    ["Store", viewProduct.store_name],
                    ["Delivery receipt", viewProduct.dr_number],
                    ["Quantity", viewProduct.quantity],
                    ["CBM", viewProduct.cbm],
                    ["Status", viewProduct.delivery_status],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="min-w-0">
                      <dt className="text-slate-400">{String(label)}</dt>
                      <dd className="mt-0.5 truncate font-medium text-slate-700">{valueText(value, "—")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>
        </div>
      )}
    </motion.div>
  );
}
