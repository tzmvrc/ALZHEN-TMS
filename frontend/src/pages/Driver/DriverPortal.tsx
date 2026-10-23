import {Link} from "react-router-dom";
import {Settings,UserRound} from "lucide-react";
import ReportTripDialog from "../../components/admin/ReportTripDialog";
import LocationSharing from "../../components/admin/LocationSharing";
import {pdfIntakeAvailable,prepareDriverPdf} from "../../services/pdf-intake.service";
import {validatePodUpload} from "../../services/pod-upload-validation";
import { lazy, Suspense, useCallback, useEffect, useRef, useState,useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import {collaborationSnapshot,subscribeCollaboration,subscribeCollaborationEvents,joinCollaborationRoom} from "../../services/collaboration.service";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Flag,
  Clock,
  LoaderCircle,
  LogOut,
  MapPin,
  Navigation,
  Package,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";
import logo from "../../assets/logo.png";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import TruckerNotifications from "../../components/admin/TruckerNotifications";
import SlideToConfirm from "../../components/ui/SlideToConfirm";
import { recognizeReceipt, type OcrResult } from "../../services/ocr.service";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import OperationsReportsView from "../../components/admin/OperationsReportsView";
import {
  saveLoadingReport,
  saveUnloadingReport,
} from "../../services/operations-report.service";
import {
  fetchMyAssignedTrips,
  getCachedAssignedTrips,
  saveDriverReceiptText,
  saveDriverTripUpdate,
  uploadDriverPod,
  type DriverAssignedStop,
  type DriverAssignedTrip,
} from "../../services/trucker.service";

/* ------------------------------------------------------------------ */
/* Constants and helpers                                               */
/* ------------------------------------------------------------------ */

const deliverySteps = [
  { label: "Trip assigned", nextAction: "Start trip" },
  { label: "On route", nextAction: "Mark arrival at stop" },
  { label: "At delivery stop", nextAction: "Start unloading" },
  { label: "Unloading", nextAction: "Complete delivery" },
  { label: "Delivered", nextAction: null },
] as const;

/* Steps 1-4 of deliverySteps, shown as the per-stop tracker. */
const stopTracker = ["On route", "Arrived", "Unloading", "Delivered"] as const;

const loadingMilestones = [
  { field: "warehouse_arrival_at", label: "Arrived at warehouse" },
  { field: "loading_start_at", label: "Loading started" },
  { field: "loading_finished_at", label: "Loading complete" },
] as const;

type Coords = { latitude: number; longitude: number };

function readDeviceLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location access is unavailable."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

/* Device GPS first; the origin warehouse's saved coordinates are the fallback. */
async function resolveLocation(trip: DriverAssignedTrip): Promise<Coords | undefined> {
  try {
    return await readDeviceLocation();
  } catch {
    if (trip.origin_latitude !== null && trip.origin_longitude !== null) {
      return { latitude: trip.origin_latitude, longitude: trip.origin_longitude };
    }
    return undefined;
  }
}

function getStepIndex(trip: DriverAssignedTrip | null, stop?: DriverAssignedStop | null) {
  if (stop?.finish_unloading_time || stop?.delivery_status?.toUpperCase() === "COMPLETED") return deliverySteps.length - 1;
  if (stop?.start_unloading_time) return 3;
  if (stop?.arrival_time) return 2;
  const status = `${trip?.driver_status ?? ""} ${trip?.delivery_status ?? ""} ${trip?.status ?? ""}`
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (stop) return /IN_PROGRESS|ACTIVE|COMPLETED/.test(String(trip?.status ?? "").toUpperCase()) ? 1 : 0;
  if (/DELIVER|COMPLETE|FINISH/.test(status)) return deliverySteps.length - 1;
  if (status.includes("UNLOAD")) return 3;
  if (/ARRIV|AT_DELIVERY|AT_STORE/.test(status)) return 2;
  if (/ON_THE_WAY|ON_ROUTE|TRANSIT|DEPART|EN_ROUTE/.test(status)) return 1;
  return 0;
}

const isDelivered = (trip: DriverAssignedTrip | null, stop: DriverAssignedStop) =>
  getStepIndex(trip, stop) === deliverySteps.length - 1;

/* A trip is finished once every stop is delivered (or the trip itself is marked complete).
   Finished trips leave "My trip" and live in the Activity reports tab as history. */
const isTripDone = (trip: DriverAssignedTrip) => {
  if (/COMPLETED|DELIVERED|FINISHED/.test(String(trip.status ?? "").toUpperCase())) return true;
  return trip.stops.length > 0 && trip.stops.every((stop) => isDelivered(trip, stop));
};

const completedAt = (trip: DriverAssignedTrip) =>
  trip.stops
    .map((stop) => stop.finish_unloading_time)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop() ?? trip.driver_updated_at ?? trip.estimated_delivery_date ?? null;

const tripTitle = (trip: DriverAssignedTrip) =>
  trip.dispatch_number || (trip.trip_number ? `Trip ${trip.trip_number}` : "Assigned trip");

const formatDate = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
};

const formatTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const stopAddress = (stop: DriverAssignedStop) =>
  [stop.address, stop.city, stop.province].filter(Boolean).join(", ");

const stopCbm = (stop: DriverAssignedStop) =>
  stop.items.reduce((sum, item) => sum + (item.cbm ?? 0), 0);

const formatCbm = (value: number) => `${Number(value.toFixed(2))} CBM`;

const stopDrNumber = (stop: DriverAssignedStop | null | undefined) =>
  stop?.dr_number ?? stop?.items.find((item) => item.dr_number)?.dr_number ?? "";

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

const DriverRouteMap = lazy(() => import("../../components/admin/DriverRouteMap"));

/* Same glass-pill look as the admin top bar (SidebarNav). */
const pillSurface =
  "border border-white/80 bg-white/80 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl";
const iconButton = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors duration-200 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 disabled:opacity-50 ${pillSurface}`;
/* TruckerNotifications renders its own button; restyle its trigger and panel to match without touching its logic. */
const bellTrigger =
  "[&>button]:h-11 [&>button]:w-11 [&>button]:rounded-full [&>button]:border-white/80 [&>button]:bg-white/80 [&>button]:text-slate-600 [&>button]:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] [&>button]:backdrop-blur-xl " +
  "[&>div>button:first-child]:h-11 [&>div>button:first-child]:w-11 [&>div>button:first-child]:rounded-full [&>div>button:first-child]:border-white/80 [&>div>button:first-child]:bg-white/80 [&>div>button:first-child]:text-slate-600 [&>div>button:first-child]:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] [&>div>button:first-child]:backdrop-blur-xl";
const bellPanel =
  "[&>div>div]:rounded-2xl [&>div>div]:border-slate-200/80 [&>div>div]:bg-white [&>div>div]:shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)]";

const cardClass = "rounded-3xl bg-white shadow-sm ring-1 ring-slate-900/5";

function StatusPill({ tone, children }: { tone: "blue" | "green" | "slate" | "amber"; children: ReactNode }) {
  const tones = {
    blue: "bg-[#e6f0f9] text-[#1d5f94]",
    green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-800",
  } as const;
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-3">
      <span className="mt-0.5 text-[#2678b9]" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function ProductList({ stop }: { stop: DriverAssignedStop }) {
  if (!stop.items.length) return <p className="text-sm text-slate-500">No products recorded for this stop.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {stop.items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 py-2.5 text-sm">
          <Package aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{item.product_name || item.model_code || item.sku || "Product"}</span>
            {(item.model_code || item.sku) && <span className="text-xs text-slate-500">{[item.model_code, item.sku].filter(Boolean).join(" · ")}</span>}
          </span>
          <span className="shrink-0 text-right text-xs text-slate-600">
            <span className="block font-semibold">Qty {item.quantity ?? "—"}</span>
            <span>{item.cbm ?? "—"} CBM</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function HistoryCard({ trip }: { trip: DriverAssignedTrip }) {
  const cbm = trip.stops.reduce((sum, stop) => sum + stopCbm(stop), 0);
  return (
    <li className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-900/5">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{tripTitle(trip)}</span>
            <span className="block truncate text-xs text-slate-500">
              {formatDate(completedAt(trip))}
              {trip.plate_number ? ` · ${trip.plate_number}` : ""} · {trip.stops.length} {trip.stops.length === 1 ? "stop" : "stops"}
            </span>
          </span>
          <StatusPill tone="green">Completed</StatusPill>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-4">
          <div className="grid grid-cols-2 gap-2">
            <InfoTile icon={<Building2 className="h-4 w-4" />} label="Picked up at" value={trip.origin || "Not recorded"} />
            <InfoTile icon={<Package className="h-4 w-4" />} label="Cargo" value={formatCbm(cbm)} />
          </div>
          <ol className="divide-y divide-slate-100">
            {trip.stops.map((stop, index) => (
              <li key={stop.id} className="flex items-start gap-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{stop.store_name || `Stop ${index + 1}`}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {stopDrNumber(stop) ? `DR ${stopDrNumber(stop)}` : "No DR number"}
                    {formatTime(stop.finish_unloading_time) ? ` · Delivered ${formatTime(stop.finish_unloading_time)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Portal                                                              */
/* ------------------------------------------------------------------ */

export default function DriverPortal() {
  const { logout, profile, accessToken } = useAuth();
  const { addToast } = useToast();
  const cachedTrips=accessToken?getCachedAssignedTrips(accessToken):null;
  const [assignedState,setAssignedState]=useState<{owner:string|undefined;rows:DriverAssignedTrip[]}>(()=>({owner:profile?.id,rows:cachedTrips??[]}));
  const assignedTrips=assignedState.owner===profile?.id?assignedState.rows:cachedTrips??[];
  const setAssignedTrips=useCallback((update:DriverAssignedTrip[]|((rows:DriverAssignedTrip[])=>DriverAssignedTrip[]))=>setAssignedState(current=>({owner:profile?.id,rows:typeof update==="function"?update(current.owner===profile?.id?current.rows:[]):update})),[profile?.id]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [tripsLoading, setTripsLoading] = useState(Boolean(accessToken&&!cachedTrips));
  const [tripsError, setTripsError] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [podUploading, setPodUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [reportsVersion,setReportsVersion]=useState(0);
  const [reportOwner, setReportOwner] = useState<string | null>(null);
  const [portalTab, setPortalTab] = useState<"trips" | "reports">("trips");
  const [activityPane, setActivityPane] = useState<"history" | "reports">("history");
  const [drNumber, setDrNumber] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const reloadTrips = useCallback(() => {
    setTripsError("");
    setReloadCount((count) => count + 1);
  }, []);
  const liveUpdates=useSyncExternalStore(subscribeCollaboration,collaborationSnapshot,collaborationSnapshot);
  const assignedTripKeys=JSON.stringify(assignedTrips.map(trip=>trip.id).sort());
  useEffect(()=>{const leaves=(JSON.parse(assignedTripKeys) as string[]).map(id=>joinCollaborationRoom("trip",id));return()=>leaves.forEach(leave=>leave());},[assignedTripKeys,profile?.id]);
  const busy = statusSaving || podUploading;
  const tripsRequestInFlightRef = useRef(false);
  const pendingTripsRequestRef = useRef<{ token: string; promise: Promise<DriverAssignedTrip[]> } | null>(null);
  const tripsErrorRef = useRef(false);
  const selectionRef = useRef({ tripId: selectedTripId, stopId: selectedStopId });
  const busyRef = useRef(busy);
  const pendingSocketRefresh=useRef(false);
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const unsubscribe=subscribeCollaborationEvents(event=>{if(event.kind!=="trucker"&&event.kind!=="connected")return;if(timer)return;timer=setTimeout(()=>{timer=undefined;if(busyRef.current)pendingSocketRefresh.current=true;else reloadTrips();},250);});return()=>{unsubscribe();clearTimeout(timer);};},[reloadTrips]);
  useEffect(() => {
    selectionRef.current = { tripId: selectedTripId, stopId: selectedStopId };
  }, [selectedTripId, selectedStopId]);
  useEffect(() => { busyRef.current = busy;if(!busy&&pendingSocketRefresh.current){pendingSocketRefresh.current=false;reloadTrips();} }, [busy,reloadTrips]);
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podPreview, setPodPreview] = useState<string | null>(null);
  const podPreviewUrl = useRef<string | null>(null);
  /* The receipt text is read on this phone while the driver types the DR number. */
  const [ocrStatus, setOcrStatus] = useState<"idle" | "scanning" | "done" | "failed">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [pdfAvailable,setPdfAvailable]=useState(false);
  useEffect(()=>{let current=true;if(accessToken)void pdfIntakeAvailable(accessToken).then(value=>{if(current)setPdfAvailable(value);},()=>{});return()=>{current=false;};},[accessToken]);
  const ocrRun = useRef(0);
  const ocrPromise = useRef<Promise<OcrResult | null> | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const activeTrips = assignedTrips.filter((trip) => !isTripDone(trip));
  const historyTrips = assignedTrips
    .filter(isTripDone)
    .sort((a, b) => String(completedAt(b) ?? "").localeCompare(String(completedAt(a) ?? "")));
  const selectedTrip = activeTrips.find((trip) => trip.id === selectedTripId) ?? activeTrips[0] ?? null;
  const nextOpenStop = selectedTrip?.stops.find((stop) => !isDelivered(selectedTrip, stop)) ?? null;
  const selectedStop = selectedTrip?.stops.find((stop) => stop.id === selectedStopId)
    ?? nextOpenStop
    ?? selectedTrip?.stops[0]
    ?? null;
  const tripStarted = Boolean(selectedTrip?.departure_from_warehouse_at);
  const loadingFinished = Boolean(selectedTrip?.loading_timestamps.loading_finished_at);
  const nextMilestone = selectedTrip
    ? loadingMilestones.find(({ field }) => !selectedTrip.loading_timestamps[field]) ?? null
    : null;
  const deliveredCount = selectedTrip?.stops.filter((stop) => isDelivered(selectedTrip, stop)).length ?? 0;
  const totalStops = selectedTrip?.stops.length ?? 0;
  const allDelivered = totalStops > 0 && deliveredCount === totalStops;
  const driverName =
    [profile?.first_name, profile?.last_name]
      .filter((name): name is string => Boolean(name?.trim()))
      .join(" ") || "Driver";

  /* Where the truck is going right now: the warehouse until loading is done, then the next open stop. */
  const heading = selectedTrip
    ? !loadingFinished
      ? { kind: "warehouse" as const, name: selectedTrip.origin || "the warehouse" }
      : nextOpenStop
        ? { kind: "store" as const, name: nextOpenStop.store_name || "the delivery stop" }
        : null
    : null;

  const resetReceiptDraft = () => {
    ocrRun.current += 1;
    ocrPromise.current = null;
    setOcrStatus("idle");
    setOcrProgress(0);
    setPodFile(null);
    setPodPreview(null);
    if (podPreviewUrl.current) {
      URL.revokeObjectURL(podPreviewUrl.current);
      podPreviewUrl.current = null;
    }
  };

  useEffect(() => {
    if (busy || tripsLoading) return;
    const id = selectedTrip?.id ?? null;
    if (id === selectedTripId) return;
    const stop = selectedTrip?.stops.find((item) => !isDelivered(selectedTrip, item)) ?? selectedTrip?.stops[0] ?? null;
    setSelectedTripId(id);
    setSelectedStopId(stop?.id ?? null);
    setCurrentStep(getStepIndex(selectedTrip, stop));
    setDrNumber(stopDrNumber(stop));
    resetReceiptDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, tripsLoading, selectedTrip?.id, selectedTripId]);

  useEffect(() => {
    if (!accessToken) return;
    // Effect replay/token changes must attach a live consumer, rather than skip
    // the request whose original effect cleanup has already marked it inactive.
    const pending = pendingTripsRequestRef.current;
    const request = pending?.token === accessToken
      ? pending
      : { token: accessToken, promise: fetchMyAssignedTrips(accessToken,reloadCount>0) };
    pendingTripsRequestRef.current = request;
    tripsRequestInFlightRef.current = true;
    tripsErrorRef.current = false;
    let active = true;
    void request.promise
      .then((trips) => {
        if (!active || busyRef.current) return;
        setTripsError("");
        setAssignedTrips(trips);
        const openTrips = trips.filter((trip) => !isTripDone(trip));
        const nextTrip = openTrips.find((trip) => trip.id === selectionRef.current.tripId) ?? openTrips[0];
        setSelectedTripId(nextTrip?.id ?? null);
        const firstStop = nextTrip?.stops.find((stop) => stop.id === selectionRef.current.stopId)
          ?? nextTrip?.stops.find((stop) => getStepIndex(nextTrip, stop) < deliverySteps.length - 1)
          ?? nextTrip?.stops[0] ?? null;
        setSelectedStopId(firstStop?.id ?? null);
        setCurrentStep(getStepIndex(nextTrip ?? null, firstStop));
        if (nextTrip?.id !== selectionRef.current.tripId || firstStop?.id !== selectionRef.current.stopId) {
          setDrNumber(stopDrNumber(firstStop));
          setPodFile(null);
          setPodPreview(null);
        }
      })
      .catch((error) => {
        if (active) {
          tripsErrorRef.current = true;
          setTripsError(error instanceof Error ? error.message : "Unable to load your assigned trips.");
        }
      })
      .finally(() => {
        if (pendingTripsRequestRef.current === request) {
          pendingTripsRequestRef.current = null;
          tripsRequestInFlightRef.current = false;
        }
        if (active) setTripsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, reloadCount,setAssignedTrips]);

  useEffect(() => {
    const refresh = () => {
      if (!busyRef.current && !tripsRequestInFlightRef.current && document.visibilityState === "visible") {
        if (tripsErrorRef.current) return;
        reloadTrips();
      }
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reloadTrips]);

  useEffect(
    () => () => {
      if (podPreviewUrl.current) URL.revokeObjectURL(podPreviewUrl.current);
    },
    [],
  );

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout();
      addToast({ title: "Logged out successfully.", variant: "success", duration: 2500 });
      setShowLogoutConfirm(false);
      window.location.assign("/trucker/login");
    } catch {
      addToast({ title: "Unable to log out completely. Please try again.", variant: "error", duration: 3500 });
    } finally {
      setLogoutLoading(false);
    }
  };

  /* ---------------- saving progress ---------------- */

  const persistTripUpdate = async (
    nextStepIndex: number,
    stop: DriverAssignedStop,
    options: { location?: Coords; notes?: string } = {},
  ) => {
    if (!selectedTrip || !stop || busy) return;
    if (!accessToken) {
      addToast({
        title: "Session unavailable",
        description: "Please sign in again to sync your trip update.",
        variant: "error",
        duration: 3500,
      });
      return;
    }

    setStatusSaving(true);
    try {
      if (nextStepIndex >= 2) {
        const field = nextStepIndex === 2
          ? "arrival_time"
          : nextStepIndex === 3
            ? "start_unloading_time"
            : "finish_unloading_time";
        await saveUnloadingReport(accessToken, selectedTrip.id, stop.id, {
          [field]: new Date().toISOString(),
        });
      }
      const result = await saveDriverTripUpdate(accessToken, {
        trip_id: selectedTrip.id,
        trip_stop_id: stop.id,
        step: nextStepIndex,
        latitude: options.location?.latitude,
        longitude: options.location?.longitude,
        dr_number: drNumber.trim() || undefined,
        notes: options.notes,
      });
      setAssignedTrips((trips) =>
        trips.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                status: result.trip_status,
                departure_from_warehouse_at: nextStepIndex === 1
                  ? result.updated_at
                  : trip.departure_from_warehouse_at,
                driver_status: result.status,
                delivery_status: result.delivery_status,
                driver_updated_at: result.updated_at,
                dr_number: drNumber.trim() || trip.dr_number,
                stops: trip.stops.map((currentStop) => currentStop.id !== stop.id ? currentStop : {
                  ...currentStop,
                  dr_number: drNumber.trim() || currentStop.dr_number,
                  delivery_status: nextStepIndex >= 2 ? result.delivery_status : currentStop.delivery_status,
                  arrival_time: nextStepIndex === 2 ? result.updated_at : currentStop.arrival_time,
                  start_unloading_time: nextStepIndex === 3 ? result.updated_at : currentStop.start_unloading_time,
                  finish_unloading_time: nextStepIndex === 4 ? result.updated_at : currentStop.finish_unloading_time,
                  items: drNumber.trim()
                    ? currentStop.items.map((item) => ({ ...item, dr_number: drNumber.trim() }))
                    : currentStop.items,
                }),
              }
            : trip,
        ),
      );

      addToast({
        title: nextStepIndex === 1 ? "Trip started" : "Progress saved",
        description: nextStepIndex === 1
          ? "Dispatch can now see your truck on the live map."
          : "Dispatch can see this update.",
        variant: "success",
        duration: 3500,
      });
    } catch (error) {
      addToast({
        title: "Unable to sync trip update",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
        duration: 4000,
      });
      setReloadCount((count) => count + 1);
      return;
    } finally {
      setStatusSaving(false);
    }

    setCurrentStep(nextStepIndex);
  };

  /* Slide to start: records the driver's position so the truck appears on the admin live map,
     and tells dispatch where the truck is heading (warehouse first, otherwise the first store). */
  const startTrip = async () => {
    if (!selectedTrip || busy) return;
    const stop = nextOpenStop ?? selectedStop;
    if (!stop) {
      addToast({
        title: "No delivery stops on this trip",
        description: "Contact dispatch before starting.",
        variant: "error",
        duration: 4500,
      });
      return;
    }
    const location = await resolveLocation(selectedTrip);
    if (!location) {
      addToast({
        title: "Location is required to start the trip",
        description: "Allow location access or ask dispatch to add coordinates to the origin warehouse.",
        variant: "error",
        duration: 4500,
      });
      return;
    }
    await persistTripUpdate(1, stop, {
      location,
      notes: `On route to ${heading?.name ?? "destination"}`,
    });
  };

  const advanceStatus = async () => {
    if (!selectedTrip || !selectedStop) return;
    const nextStepIndex = currentStep + 1;
    if (!deliverySteps[nextStepIndex]) return;
    if (nextStepIndex === 2 && !loadingFinished) {
      addToast({
        title: "Finish loading first",
        description: "Record the warehouse loading steps before marking arrival at a stop.",
        variant: "error",
      });
      return;
    }
    const location = nextStepIndex === 2 ? await resolveLocation(selectedTrip) : undefined;
    await persistTripUpdate(nextStepIndex, selectedStop, {
      location,
      notes: nextStepIndex === 2 ? `Arrived at ${selectedStop.store_name || "delivery stop"}` : undefined,
    });
  };

  /* Once loading is done the truck is no longer heading to the warehouse; refresh the
     live-map position and destination. Best effort, so a failure never blocks loading. */
  const announceHeadingToStore = async (trip: DriverAssignedTrip, stop: DriverAssignedStop) => {
    if (!accessToken) return;
    try {
      const location = await resolveLocation(trip);
      if (!location) return;
      await saveDriverTripUpdate(accessToken, {
        trip_id: trip.id,
        trip_stop_id: stop.id,
        step: 1,
        latitude: location.latitude,
        longitude: location.longitude,
        notes: `On route to ${stop.store_name || "delivery stop"}`,
      });
    } catch {
      /* ignored on purpose */
    }
  };

  const saveLoadingMilestone = async () => {
    if (!accessToken || !selectedTrip || busy || !nextMilestone) return;
    const milestone = nextMilestone;
    const timestamp = new Date().toISOString();
    setStatusSaving(true);
    try {
      await saveLoadingReport(accessToken, selectedTrip.id, { [milestone.field]: timestamp });
      setAssignedTrips((trips) => trips.map((trip) => trip.id !== selectedTrip.id ? trip : {
        ...trip,
        loading_timestamps: { ...trip.loading_timestamps, [milestone.field]: timestamp },
      }));
      addToast({
        title: milestone.label,
        description: "Loading progress is saved and visible to dispatch.",
        variant: "success",
      });
      if (milestone.field === "loading_finished_at" && tripStarted && nextOpenStop) {
        void announceHeadingToStore(selectedTrip, nextOpenStop);
      }
    } catch (error) {
      addToast({
        title: "Unable to save loading progress",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
      setReloadCount((count) => count + 1);
    } finally {
      setStatusSaving(false);
    }
  };

  /* ---------------- selection ---------------- */

  const selectTrip = (trip: DriverAssignedTrip) => {
    if (busy || trip.id === selectedTripId) return;
    setSelectedTripId(trip.id);
    const nextStop = trip.stops.find((stop) => getStepIndex(trip, stop) < deliverySteps.length - 1) ?? trip.stops[0] ?? null;
    setSelectedStopId(nextStop?.id ?? null);
    setCurrentStep(getStepIndex(trip, nextStop));
    setDrNumber(stopDrNumber(nextStop));
    resetReceiptDraft();
  };

  const selectStop = (stop: DriverAssignedStop) => {
    if (busy) return;
    setSelectedStopId(stop.id);
    setCurrentStep(getStepIndex(selectedTrip, stop));
    setDrNumber(stopDrNumber(stop));
    resetReceiptDraft();
  };

  const selectPodPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    try{validatePodUpload(file,pdfAvailable);}catch(error){addToast({title:"Unable to use receipt",description:error instanceof Error?error.message:"Invalid document",variant:"error"});event.target.value="";return;}
    if (podPreviewUrl.current) URL.revokeObjectURL(podPreviewUrl.current);
    podPreviewUrl.current = URL.createObjectURL(file);
    setPodPreview(podPreviewUrl.current);
    setPodFile(file);
    startOcr(file);
  };

  /* Runs in the background. A failure never blocks saving; dispatch can still read the photo. */
  const startOcr = (file: File) => {
    const run = (ocrRun.current += 1);
    setOcrStatus("scanning");
    setOcrProgress(0);
    const source=file.type==="application/pdf"&&accessToken&&selectedTrip&&selectedStop?prepareDriverPdf(accessToken,selectedTrip.id,selectedStop.id,file):Promise.resolve(file);
    ocrPromise.current = source.then(pages=>recognizeReceipt(pages, (fraction) => {
      if (ocrRun.current === run) setOcrProgress(fraction);
    })).then(
      (result) => {
        if (ocrRun.current === run) setOcrStatus(result.text ? "done" : "failed");
        return result.text ? result : null;
      },
      () => {
        if (ocrRun.current === run) setOcrStatus("failed");
        return null;
      },
    );
  };

  const saveReceipt = async () => {
    if (!selectedTrip || !selectedStop || !accessToken || !drNumber.trim() || !podFile || busy) return;
    setPodUploading(true);
    try {
      const pending = ocrPromise.current;
      const receipt = await uploadDriverPod(accessToken, selectedTrip.id, selectedStop.id, podFile, drNumber);
      /* Hand the text to dispatch as soon as it is ready (usually already is). Best effort:
         if it fails, the admin screen falls back to reading the photo itself. */
      const tripId = selectedTrip.id;
      const stopId = selectedStop.id;
      void pending?.then((result) =>
        result ? saveDriverReceiptText(accessToken, tripId, stopId, { receipt_id: receipt.receipt_id, ocr_text: result.text, ocr_confidence: result.confidence }) : undefined,
      ).catch(() => undefined);
      setAssignedTrips((trips) =>
        trips.map((trip) =>
          trip.id === selectedTrip.id
            ? {
                ...trip,
                status: receipt.trip_status,
                driver_status: receipt.status,
                delivery_status: receipt.delivery_status,
                driver_updated_at: receipt.updated_at,
                dr_number: receipt.receipt_only ? trip.dr_number : drNumber.trim(),
                pod_image_path: receipt.storage_path,
                stops: trip.stops.map((stop) => stop.id === selectedStop.id
                  ? {
                      ...stop,
                      dr_number: receipt.receipt_only ? stop.dr_number : drNumber.trim(),
                      delivery_status: receipt.delivery_status,
                      finish_unloading_time: receipt.receipt_only ? (receipt.finish_unloading_time === undefined ? stop.finish_unloading_time : receipt.finish_unloading_time) : receipt.finish_unloading_time ?? receipt.updated_at,
                      items: receipt.receipt_only ? stop.items : stop.items.map((item) => ({ ...item, dr_number: drNumber.trim() })),
                    }
                  : stop),
              }
            : trip,
        ),
      );
      setCurrentStep(deliverySteps.length - 1);
      addToast({
        title: "Delivery receipt saved",
        description: receipt.receipt_only ? "A new receipt was submitted for review. Existing delivery times and DR values were preserved." : "The DR number, receipt photo, and delivered status are saved to this trip.",
        variant: "success",
        duration: 4000,
      });
    } catch (error) {
      addToast({
        title: "Unable to save delivery receipt",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
        duration: 4000,
      });
    } finally {
      setPodUploading(false);
    }
  };

  /* ---------------- render pieces ---------------- */

  const tripSwitcher = activeTrips.length > 1 && (
    <div aria-label="Assigned trips" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {activeTrips.map((trip) => {
        const active = trip.id === selectedTrip?.id;
        return (
          <button
            key={trip.id}
            type="button"
            disabled={busy}
            aria-pressed={active}
            onClick={() => selectTrip(trip)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-[#0b2341] bg-[#0b2341] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
          >
            {tripTitle(trip)}
          </button>
        );
      })}
    </div>
  );

  const renderMap = (trip: DriverAssignedTrip, live: boolean) => (
    <section aria-label={live ? "Navigation" : "Route preview"} className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{live ? "Navigation" : "Route preview"}</h3>
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">Demo route · not live GPS</span>
      </div>
      <Suspense fallback={<div aria-busy="true" className="h-[440px] animate-pulse rounded-3xl bg-slate-200/70" />}>
        <DriverRouteMap tripId={trip.id} live={live} />
      </Suspense>
    </section>
  );

  const renderBrief = (trip: DriverAssignedTrip) => {
    const totalItems = trip.stops.reduce((sum, stop) => sum + stop.items.length, 0);
    const totalCbm = trip.stops.reduce((sum, stop) => sum + stopCbm(stop), 0);
    const facts = [
      { icon: <Truck className="h-4 w-4" />, label: "Truck", value: trip.plate_number || "—" },
      { icon: <CalendarDays className="h-4 w-4" />, label: "Loading", value: formatDate(trip.loading_date) },
      { icon: <Clock className="h-4 w-4" />, label: "Est. delivery", value: formatDate(trip.estimated_delivery_date) },
    ];
    return (
      <>
        <section className="rounded-3xl bg-gradient-to-br from-[#0b2341] to-[#16436f] p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Next trip</p>
              <h2 className="mt-1 truncate text-2xl font-extrabold tracking-tight">{tripTitle(trip)}</h2>
            </div>
            <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Ready to start</span>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0 rounded-2xl bg-white/10 px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-[11px] text-blue-200">{fact.icon}{fact.label}</dt>
                <dd className="mt-1 truncate text-sm font-semibold">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-center gap-2 text-sm text-blue-100">
            <Package aria-hidden="true" className="h-4 w-4" />
            {trip.stops.length} {trip.stops.length === 1 ? "stop" : "stops"} · {totalItems} {totalItems === 1 ? "product" : "products"} · {formatCbm(totalCbm)}
          </p>
        </section>

        {renderMap(trip, false)}

        <section className={`${cardClass} p-5`} aria-labelledby="route-title">
          <h3 id="route-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Route</h3>
          <ol className="mt-4">
            <li className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b2341] text-white"><Building2 aria-hidden="true" className="h-4 w-4" /></span>
                <span className="my-1 w-0.5 flex-1 rounded bg-slate-200" />
              </div>
              <div className="min-w-0 pb-5 pt-0.5">
                <p className="text-xs text-slate-500">Pick up at</p>
                <p className="break-words font-semibold">{trip.origin || "Origin not recorded"}</p>
              </div>
            </li>
            {trip.stops.map((stop, index) => {
              const last = index === trip.stops.length - 1;
              return (
                <li key={stop.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e6f0f9] text-sm font-bold text-[#1d5f94]">{stop.stop_sequence || index + 1}</span>
                    {!last && <span className="my-1 w-0.5 flex-1 rounded bg-slate-200" />}
                  </div>
                  <div className={`min-w-0 flex-1 pt-0.5 ${last ? "" : "pb-5"}`}>
                    <p className="break-words font-semibold">{stop.store_name || "Store not recorded"}</p>
                    {stop.customer_name && <p className="text-sm text-slate-500">{stop.customer_name}</p>}
                    {stopAddress(stop) && <p className="break-words text-sm text-slate-500">{stopAddress(stop)}</p>}
                    <details className="group mt-1.5">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
                        {stop.items.length} {stop.items.length === 1 ? "product" : "products"} · {formatCbm(stopCbm(stop))}
                        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition group-open:rotate-180" />
                      </summary>
                      <div className="mt-2 rounded-2xl bg-slate-50 px-3"><ProductList stop={stop} /></div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ol>
          {!trip.stops.length && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No delivery stops recorded. Contact dispatch before starting.</p>}
        </section>
      </>
    );
  };

  const renderStopCard = (trip: DriverAssignedTrip, stop: DriverAssignedStop, index: number) => {
    const stepIdx = getStepIndex(trip, stop);
    const delivered = stepIdx === deliverySteps.length - 1;
    const active = stop.id === selectedStop?.id;
    const nextAction = deliverySteps[stepIdx].nextAction;
    const blockedByLoading = stepIdx === 1 && !loadingFinished;
    const statusLabel = delivered ? "Delivered" : stepIdx >= 2 ? deliverySteps[stepIdx].label : "Pending";
    return (
      <li key={stop.id} className={`overflow-hidden rounded-2xl border bg-white ${active ? "border-[#2678b9] shadow-sm" : "border-slate-200"}`}>
        <button
          type="button"
          disabled={busy}
          aria-expanded={active}
          onClick={() => selectStop(stop)}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${delivered ? "bg-emerald-100 text-emerald-700" : "bg-[#e6f0f9] text-[#1d5f94]"}`}>
            {delivered ? <Check aria-hidden="true" className="h-4 w-4" /> : stop.stop_sequence || index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{stop.store_name || `Stop ${index + 1}`}</span>
            {stopAddress(stop) && <span className="block truncate text-xs text-slate-500">{stopAddress(stop)}</span>}
          </span>
          <StatusPill tone={delivered ? "green" : stepIdx >= 2 ? "blue" : "slate"}>{statusLabel}</StatusPill>
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition ${active ? "rotate-180" : ""}`} />
        </button>

        {active && (
          <div className="space-y-5 border-t border-slate-100 p-4">
            {/* Tracker */}
            <ol className="grid grid-cols-4 gap-1" aria-label="Stop progress">
              {stopTracker.map((label, i) => {
                const n = i + 1;
                const state = stepIdx > n || (n === 4 && stepIdx === 4) ? "done" : stepIdx === n ? "current" : "todo";
                return (
                  <li key={label} className="flex flex-col items-center gap-1.5 text-center">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${state === "done" ? "bg-emerald-500 text-white" : state === "current" ? "bg-[#2678b9] text-white ring-4 ring-[#2678b9]/15" : "bg-slate-100 text-slate-400"}`}>
                      {state === "done" ? <Check aria-hidden="true" className="h-4 w-4" /> : n}
                    </span>
                    <span className={`text-[11px] leading-tight ${state === "todo" ? "text-slate-400" : "font-semibold text-slate-700"}`}>{label}</span>
                  </li>
                );
              })}
            </ol>

            {/* Action */}
            {nextAction ? (
              <div>
                <button
                  type="button"
                  disabled={busy || blockedByLoading}
                  onClick={() => void advanceStatus()}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b2341] px-4 text-sm font-bold text-white transition hover:bg-[#16385f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {statusSaving ? "Saving…" : nextAction}
                  {!statusSaving && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                </button>
                {blockedByLoading && <p className="mt-2 text-center text-xs text-slate-500">Finish warehouse loading to unlock this step.</p>}
              </div>
            ) : (
              <p className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-700">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                Delivered{formatTime(stop.finish_unloading_time) ? ` at ${formatTime(stop.finish_unloading_time)}` : ""}
              </p>
            )}

            {/* Products */}
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Products ({stop.items.length})
                <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="mt-2"><ProductList stop={stop} /></div>
            </details>
          </div>
        )}
      </li>
    );
  };

  const renderReceiptCard = (trip: DriverAssignedTrip, stop: DriverAssignedStop) => {
    const stepIdx = getStepIndex(trip, stop);
    const saved = stepIdx === deliverySteps.length - 1 && Boolean(stop.dr_number);
    return (
      <section aria-labelledby="receipt-title" className={`${cardClass} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="receipt-title" className="font-bold">Delivery receipt</h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">For {stop.store_name || "this stop"}</p>
          </div>
          {saved && <StatusPill tone="green">Saved</StatusPill>}
        </div>

        <label
          htmlFor="pod-photo"
          className={`mt-4 flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-center transition ${podPreview ? "border-transparent bg-slate-100" : "border-slate-300 bg-slate-50 hover:border-[#2678b9] hover:bg-[#e6f0f9]/40"} ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {podPreview ? (
            podFile?.type==="application/pdf"?<iframe title="PDF receipt preview" sandbox="" src={podPreview} className="h-full w-full"/>:<img src={podPreview} alt="Preview of the receipt photo" className="h-full w-full object-contain" />
          ) : (
            <>
              <Camera aria-hidden="true" className="h-8 w-8 text-[#2678b9]" />
              <span className="text-sm font-semibold">Take a photo of the signed receipt</span>
              <span className="px-6 text-xs text-slate-500">Lay it flat and make sure all the text is sharp.</span>
            </>
          )}
          <input id="pod-photo" type="file" accept={pdfAvailable?"image/jpeg,image/png,image/webp,application/pdf":"image/jpeg,image/png,image/webp"} capture="environment" className="sr-only" onChange={selectPodPhoto} disabled={busy} />
        </label>
        {podPreview && (
          <label htmlFor="pod-photo" className="mt-2 block cursor-pointer text-center text-xs font-semibold text-[#2678b9]">Retake photo</label>
        )}
        {podPreview && ocrStatus !== "idle" && (
          <div role="status" aria-live="polite" className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {ocrStatus === "scanning" && (
              <>
                <p className="font-semibold text-[#0b2341]">Reading the receipt… {Math.round(ocrProgress * 100)}%</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-[#2678b9] transition-all" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
                </div>
                <p className="mt-1.5">You can keep typing the DR number.</p>
              </>
            )}
            {ocrStatus === "done" && <p className="font-semibold text-emerald-700">Receipt text read. It will be sent to dispatch with your photo.</p>}
            {ocrStatus === "failed" && <p>Couldn’t read the text. That’s okay, dispatch will check the photo.</p>}
          </div>
        )}

        <label className="mt-4 block text-xs font-medium text-slate-600">
          DR number
          <input
            value={drNumber}
            maxLength={100}
            disabled={busy}
            onChange={(event) => setDrNumber(event.target.value)}
            autoComplete="off"
            placeholder="Enter DR number"
            className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-[#0b2341] focus:border-[#2678b9] focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <button
          type="button"
          disabled={!drNumber.trim() || !podFile || busy}
          onClick={() => void saveReceipt()}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <PackageCheck aria-hidden="true" className="h-4 w-4" />
          {podUploading ? "Saving receipt…" : saved ? "Submit replacement for review" : "Save receipt"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">Dispatch reads the text from your photo and checks it.</p>
      </section>
    );
  };

  const renderLive = (trip: DriverAssignedTrip) => (
    <>
      {/* Where am I going */}
      <section className="rounded-3xl bg-gradient-to-br from-[#0b2341] to-[#16436f] p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-blue-200">{tripTitle(trip)}{trip.plate_number ? ` · ${trip.plate_number}` : ""}</p>
          {!allDelivered && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
              Live
            </span>
          )}
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-blue-200">{allDelivered ? "Trip status" : "Heading to"}</p>
        <p className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight">
          {allDelivered ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-300" /> : <Navigation aria-hidden="true" className="h-5 w-5 shrink-0 text-[#7fb8e6]" />}
          <span className="truncate">{allDelivered ? "All deliveries complete" : heading?.name ?? "Next stop"}</span>
        </p>
        {!allDelivered && heading && (
          <p className="mt-1 text-sm text-blue-200">
            {heading.kind === "warehouse" ? "Warehouse pickup" : `Delivery ${deliveredCount + 1} of ${totalStops}`}
          </p>
        )}
        {totalStops > 0 && (
          <div className="mt-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={totalStops} aria-valuenow={deliveredCount} aria-label="Deliveries completed">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${(deliveredCount / totalStops) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-blue-200">{deliveredCount} of {totalStops} {totalStops === 1 ? "delivery" : "deliveries"} completed</p>
          </div>
        )}
      </section>

      {renderMap(trip, true)}

      {/* Loading */}
      <section aria-labelledby="loading-title" className={`${cardClass} p-5`}>
        {loadingFinished ? (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check aria-hidden="true" className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <h3 id="loading-title" className="font-bold">Loading complete</h3>
              <p className="text-xs text-slate-500">Finished at {formatTime(trip.loading_timestamps.loading_finished_at) || "—"}</p>
            </div>
          </div>
        ) : (
          <>
            <h3 id="loading-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Warehouse loading</h3>
            <ol className="mt-4 grid grid-cols-3 gap-2">
              {loadingMilestones.map(({ field, label }, index) => {
                const timestamp = trip.loading_timestamps[field];
                const done = Boolean(timestamp);
                const current = nextMilestone?.field === field;
                return (
                  <li key={field} className="flex flex-col items-center gap-1.5 text-center">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-500 text-white" : current ? "bg-[#2678b9] text-white ring-4 ring-[#2678b9]/15" : "bg-slate-100 text-slate-400"}`}>
                      {done ? <Check aria-hidden="true" className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className={`text-[11px] leading-tight ${done || current ? "font-semibold text-slate-700" : "text-slate-400"}`}>{label}</span>
                    <span className="text-[11px] text-slate-400">{formatTime(timestamp) || "—"}</span>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveLoadingMilestone()}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0b2341] px-4 text-sm font-bold text-white transition hover:bg-[#16385f] disabled:opacity-50"
            >
              {statusSaving ? "Saving…" : nextMilestone?.label ?? "Update loading"}
              {!statusSaving && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          </>
        )}
      </section>

      {/* Deliveries */}
      <section aria-labelledby="deliveries-title" className="space-y-3">
        <h3 id="deliveries-title" className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Deliveries</h3>
        {trip.stops.length ? (
          <ol className="space-y-3">{trip.stops.map((stop, index) => renderStopCard(trip, stop, index))}</ol>
        ) : (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">No delivery stops recorded. Contact dispatch.</p>
        )}
      </section>

      {selectedStop && getStepIndex(trip, selectedStop) >= 2 && renderReceiptCard(trip, selectedStop)}
    </>
  );

  const showStartBar = portalTab === "trips" && !tripsLoading && selectedTrip && !tripStarted;
  const tabs = [
    ["trips", "My trip", Truck],
    ["reports", "Activity reports", ClipboardList],
  ] as const;

  return (
    <div className="driver-portal min-h-screen bg-[#f4f6f9] text-[#0b2341]">
      <header className="sticky top-0 z-30 bg-[#f4f6f9]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className={`flex h-11 min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-4 ${pillSurface}`}>
            <img src={logo} alt="Alzhen Trucking Services" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">{driverName}</p>
              <p role="status" className="flex items-center gap-1.5 text-[11px] leading-tight text-slate-500">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${liveUpdates.connected ? "bg-emerald-500" : "bg-amber-400"}`} />
                {liveUpdates.connected ? "Live" : "Reconnecting"} · Driver
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className={`relative ${bellTrigger} ${bellPanel}`}>
              <TruckerNotifications />
            </div>
            <Link to="/trucker/profile" aria-label="My profile" title="My profile" aria-disabled={busy} tabIndex={busy?-1:0} className={`${iconButton} !h-9 !w-9 ${busy?"pointer-events-none opacity-40":""}`}><UserRound className="h-4 w-4"/></Link>
            <Link to="/trucker/settings" aria-label="Account settings" title="Account settings" aria-disabled={busy} tabIndex={busy?-1:0} className={`${iconButton} !h-9 !w-9 ${busy?"pointer-events-none opacity-40":""}`}><Settings className="h-4 w-4"/></Link>
            <button type="button" onClick={() => setShowLogoutConfirm(true)} aria-label="Log out" title="Log out" className={`${iconButton} hover:!text-rose-600`}>
              <LogOut aria-hidden="true" className="h-[18px] w-[18px] stroke-[1.6]" />
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-2xl space-y-5 px-4 pt-4 ${showStartBar ? "pb-44" : "pb-10"}`}>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Driver sections" className="grid flex-1 grid-cols-2 rounded-2xl bg-slate-200/60 p-1 text-sm font-semibold">
            {tabs.map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={portalTab === key}
                disabled={busy}
                onClick={() => setPortalTab(key)}
                className={`inline-flex items-center justify-center gap-2 rounded-xl py-2.5 transition disabled:opacity-50 ${portalTab === key ? "bg-white text-[#0b2341] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <button type="button" disabled={busy || tripsLoading} aria-label="Refresh" title="Refresh" onClick={reloadTrips} className={iconButton}>
            <RefreshCw aria-hidden="true" className={`h-[18px] w-[18px] stroke-[1.6] ${tripsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {portalTab === "reports" ? (
 <section className="space-y-4" aria-label="Activity reports">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold tracking-tight">Activity</h2>
              <button
                type="button"
                disabled={busy || !accessToken}
                onClick={() => setReportOwner(profile?.id ?? null)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0b2341] shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Flag aria-hidden="true" className="h-3.5 w-3.5" />
                Report an issue
              </button>
            </div>

            <div role="tablist" aria-label="Activity" className="flex gap-6 border-b border-slate-200">
              {([["history", `Trip history${historyTrips.length ? ` (${historyTrips.length})` : ""}`], ["reports", "Reports"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activityPane === key}
                  onClick={() => setActivityPane(key)}
                  className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition ${activityPane === key ? "border-[#0b2341] text-[#0b2341]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activityPane === "history" ? (
              historyTrips.length ? (
                <ul className="space-y-3">{historyTrips.map((trip) => <HistoryCard key={trip.id} trip={trip} />)}</ul>
              ) : (
                <div role="status" className={`${cardClass} p-6 text-center`}>
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <ClipboardList aria-hidden="true" className="h-6 w-6" />
                  </span>
                  <p className="mt-3 font-bold">No completed trips yet</p>
                  <p className="mt-1 text-sm text-slate-500">Finished trips will be listed here.</p>
                </div>
              )
            ) : (
              <div className="[&_details]:rounded-2xl [&_details]:bg-white [&_details]:shadow-sm [&_details]:ring-1 [&_details]:ring-slate-900/5 [&_input]:h-11 [&_input]:rounded-xl [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-sm [&_label]:text-xs [&_label]:font-medium [&_label]:text-slate-600 [&_summary]:cursor-pointer [&_summary]:py-2 [&_summary]:text-sm [&_summary]:font-semibold">
                <OperationsReportsView mode="trucker" refreshVersion={reportsVersion} />
              </div>
            )}
          </section>
        ) : (
          <>
            {tripsLoading && !selectedTrip && (
              <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-10 text-sm font-medium text-slate-500">
                <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#2678b9]" />
                Loading your trip
              </div>
            )}
            {tripsError && (
              <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="min-w-0 flex-1">{tripsError}</p>
                <button type="button" disabled={tripsLoading} onClick={reloadTrips} className="min-h-9 shrink-0 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold hover:bg-red-100 disabled:opacity-50">Try again</button>
              </div>
            )}
            {!tripsLoading && !tripsError && !selectedTrip && (
              <div role="status" className={`${cardClass} p-6 text-center`}>
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Truck aria-hidden="true" className="h-6 w-6" />
                </span>
                <p className="mt-3 font-bold">No active trip</p>
                <p className="mt-1 text-sm text-slate-500">New trips from your dispatcher will show up here.</p>
                {historyTrips.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setActivityPane("history"); setPortalTab("reports"); }}
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-semibold text-[#0b2341] transition hover:bg-slate-50"
                  >
                    View trip history
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {selectedTrip && (
              <>
                {tripSwitcher}
                {accessToken && <LocationSharing key={selectedTrip.id} token={accessToken} tripId={selectedTrip.id} />}
                {tripStarted ? renderLive(selectedTrip) : renderBrief(selectedTrip)}
              </>
            )}
          </>
        )}
        <p className="pt-2 text-center text-xs text-slate-400">Use your phone only when parked safely. Contact dispatch if the route or cargo details are wrong.</p>
      </main>

      {/* Slide to start, pinned to the bottom of the trip brief */}
      {showStartBar && selectedTrip && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto max-w-2xl px-4 pt-3">
            <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Starting shares your location with dispatch. First stop: {heading?.name ?? "—"}</span>
            </p>
            <SlideToConfirm
              label="Slide to start trip"
              busyLabel="Starting trip…"
              disabled={busy || !selectedTrip.stops.length}
              onConfirm={startTrip}
            />
          </div>
        </div>
      )}

      {reportOwner && reportOwner === profile?.id && accessToken && <ReportTripDialog key={accessToken} token={accessToken} onSubmitted={() => setReportsVersion(current=>current+1)} onClose={() => setReportOwner(null)} onComplete={message => { setReportOwner(null); addToast({ title: message, variant: "success" }); }} />}
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log out?"
        description="Are you sure you want to log out of the driver portal?"
        cancelLabel="Stay on trip"
        confirmLabel="Log out"
        confirmDisabled={logoutLoading}
        isConfirming={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => void handleConfirmLogout()}
      />
    </div>
  );
}