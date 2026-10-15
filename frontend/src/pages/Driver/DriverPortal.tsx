import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
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

const cardClass = "rounded-2xl border border-slate-200 bg-white shadow-sm";

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

/* ------------------------------------------------------------------ */
/* Portal                                                              */
/* ------------------------------------------------------------------ */

export default function DriverPortal() {
  const { logout, profile, accessToken } = useAuth();
  const { addToast } = useToast();
  const [assignedTrips, setAssignedTrips] = useState<DriverAssignedTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [tripsLoading, setTripsLoading] = useState(Boolean(accessToken));
  const [tripsError, setTripsError] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [podUploading, setPodUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [portalTab, setPortalTab] = useState<"trips" | "reports">("trips");
  const [drNumber, setDrNumber] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const busy = statusSaving || podUploading;
  const tripsRequestInFlightRef = useRef(false);
  const tripsErrorRef = useRef(false);
  const selectionRef = useRef({ tripId: selectedTripId, stopId: selectedStopId });
  const busyRef = useRef(busy);
  useEffect(() => {
    selectionRef.current = { tripId: selectedTripId, stopId: selectedStopId };
  }, [selectedTripId, selectedStopId]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podPreview, setPodPreview] = useState<string | null>(null);
  const podPreviewUrl = useRef<string | null>(null);
  /* The receipt text is read on this phone while the driver types the DR number. */
  const [ocrStatus, setOcrStatus] = useState<"idle" | "scanning" | "done" | "failed">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const ocrRun = useRef(0);
  const ocrPromise = useRef<Promise<OcrResult | null> | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const selectedTrip = assignedTrips.find((trip) => trip.id === selectedTripId) ?? null;
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
    if (!accessToken) return;
    if (tripsRequestInFlightRef.current) return;
    tripsRequestInFlightRef.current = true;
    tripsErrorRef.current = false;
    setTripsLoading(true);
    setTripsError("");
    let active = true;
    void fetchMyAssignedTrips(accessToken)
      .then((trips) => {
        if (!active || busyRef.current) return;
        setTripsError("");
        setAssignedTrips(trips);
        const nextTrip = trips.find((trip) => trip.id === selectionRef.current.tripId) ?? trips[0];
        setSelectedTripId(nextTrip?.id ?? null);
        const firstStop = nextTrip?.stops.find((stop) => stop.id === selectionRef.current.stopId)
          ?? nextTrip?.stops.find((stop) => getStepIndex(nextTrip, stop) < deliverySteps.length - 1)
          ?? nextTrip?.stops[0] ?? null;
        setSelectedStopId(firstStop?.id ?? null);
        setCurrentStep(getStepIndex(nextTrip ?? null, firstStop));
        if (reloadCount === 0 || nextTrip?.id !== selectionRef.current.tripId || firstStop?.id !== selectionRef.current.stopId) {
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
        tripsRequestInFlightRef.current = false;
        setTripsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, reloadCount]);

  useEffect(() => {
    const refresh = () => {
      if (!busyRef.current && !tripsRequestInFlightRef.current && document.visibilityState === "visible") {
        if (tripsErrorRef.current) return;
        setReloadCount((count) => count + 1);
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
  }, []);

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
    if (file.size > 5 * 1024 * 1024) {
      addToast({ title: "Choose a photo up to 5 MB", variant: "error" });
      event.target.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      addToast({
        title: "Choose a photo",
        description: "Please select an image of the signed delivery receipt.",
        variant: "error",
        duration: 3500,
      });
      event.target.value = "";
      return;
    }
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
    ocrPromise.current = recognizeReceipt(file, (fraction) => {
      if (ocrRun.current === run) setOcrProgress(fraction);
    }).then(
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
                dr_number: drNumber.trim(),
                pod_image_path: receipt.storage_path,
                stops: trip.stops.map((stop) => stop.id === selectedStop.id
                  ? {
                      ...stop,
                      dr_number: drNumber.trim(),
                      delivery_status: receipt.delivery_status,
                      finish_unloading_time: receipt.updated_at,
                      items: stop.items.map((item) => ({ ...item, dr_number: drNumber.trim() })),
                    }
                  : stop),
              }
            : trip,
        ),
      );
      setCurrentStep(deliverySteps.length - 1);
      addToast({
        title: "Delivery receipt saved",
        description: "The DR number, receipt photo, and delivered status are saved to this trip.",
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

  const tripSwitcher = assignedTrips.length > 1 && (
    <div aria-label="Assigned trips" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {assignedTrips.map((trip) => {
        const active = trip.id === selectedTripId;
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

  const renderBrief = (trip: DriverAssignedTrip) => {
    const totalItems = trip.stops.reduce((sum, stop) => sum + stop.items.length, 0);
    const totalCbm = trip.stops.reduce((sum, stop) => sum + stopCbm(stop), 0);
    return (
      <>
        <section className={`${cardClass} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Your next trip</p>
              <h2 className="mt-1 truncate text-2xl font-extrabold tracking-tight">{tripTitle(trip)}</h2>
            </div>
            <StatusPill tone="blue">Ready to start</StatusPill>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <InfoTile icon={<Truck className="h-4 w-4" />} label="Truck" value={trip.plate_number || "Not recorded"} />
            <InfoTile icon={<CalendarDays className="h-4 w-4" />} label="Loading date" value={formatDate(trip.loading_date)} />
            <InfoTile icon={<Clock className="h-4 w-4" />} label="Est. delivery" value={formatDate(trip.estimated_delivery_date)} />
            <InfoTile icon={<Package className="h-4 w-4" />} label="Cargo" value={`${totalItems} ${totalItems === 1 ? "product" : "products"} · ${formatCbm(totalCbm)}`} />
          </div>
        </section>

        <section className={`${cardClass} p-5`} aria-labelledby="route-title">
          <h3 id="route-title" className="font-bold">Route</h3>
          <ol className="mt-4">
            <li className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0b2341] text-white"><Building2 aria-hidden="true" className="h-4 w-4" /></span>
                <span className="my-1 w-px flex-1 border-l-2 border-dashed border-slate-300" />
              </div>
              <div className="min-w-0 pb-5">
                <p className="text-xs text-slate-500">Pick up at</p>
                <p className="mt-0.5 break-words font-semibold">{trip.origin || "Origin not recorded"}</p>
              </div>
            </li>
            {trip.stops.map((stop, index) => {
              const last = index === trip.stops.length - 1;
              const cbm = stopCbm(stop);
              return (
                <li key={stop.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e6f0f9] text-sm font-bold text-[#1d5f94]">{stop.stop_sequence || index + 1}</span>
                    {!last && <span className="my-1 w-px flex-1 border-l-2 border-dashed border-slate-300" />}
                  </div>
                  <div className={`min-w-0 flex-1 ${last ? "" : "pb-5"}`}>
                    <p className="break-words font-semibold">{stop.store_name || "Store not recorded"}</p>
                    {stop.customer_name && <p className="text-sm text-slate-500">{stop.customer_name}</p>}
                    {stopAddress(stop) && <p className="mt-0.5 break-words text-sm text-slate-500">{stopAddress(stop)}</p>}
                    <p className="mt-1.5 text-xs font-medium text-slate-500">{stop.items.length} {stop.items.length === 1 ? "product" : "products"} · {formatCbm(cbm)}</p>
                    <details className="group mt-1">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-[#2678b9] [&::-webkit-details-marker]:hidden">
                        View products
                        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition group-open:rotate-180" />
                      </summary>
                      <div className="mt-1 rounded-xl bg-slate-50 px-3"><ProductList stop={stop} /></div>
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
            <img src={podPreview} alt="Preview of the receipt photo" className="h-full w-full object-contain" />
          ) : (
            <>
              <Camera aria-hidden="true" className="h-8 w-8 text-[#2678b9]" />
              <span className="text-sm font-semibold">Take a photo of the signed receipt</span>
              <span className="px-6 text-xs text-slate-500">Lay it flat and make sure all the text is sharp.</span>
            </>
          )}
          <input id="pod-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={selectPodPhoto} disabled={busy} />
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
          {podUploading ? "Saving receipt…" : saved ? "Replace receipt" : "Save receipt"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">Dispatch reads the text from your photo and checks it.</p>
      </section>
    );
  };

  const renderLive = (trip: DriverAssignedTrip) => (
    <>
      {/* Where am I going */}
      <section className="rounded-2xl bg-[#0b2341] p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-blue-200">{tripTitle(trip)}{trip.plate_number ? ` · ${trip.plate_number}` : ""}</p>
            <p className="mt-3 text-xs text-blue-200">{allDelivered ? "Trip status" : "Heading to"}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xl font-extrabold tracking-tight">
              {allDelivered ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-300" /> : <Navigation aria-hidden="true" className="h-5 w-5 shrink-0 text-[#7fb8e6]" />}
              <span className="truncate">{allDelivered ? "All deliveries complete" : heading?.name ?? "Next stop"}</span>
            </p>
            {!allDelivered && heading && (
              <p className="mt-1 text-sm text-blue-200">
                {heading.kind === "warehouse" ? "Warehouse pickup" : `Delivery ${deliveredCount + 1} of ${totalStops}`}
              </p>
            )}
          </div>
          {!allDelivered && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              Live
            </span>
          )}
        </div>
        {totalStops > 0 && (
          <div className="mt-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={totalStops} aria-valuenow={deliveredCount} aria-label="Deliveries completed">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${(deliveredCount / totalStops) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-blue-200">{deliveredCount} of {totalStops} {totalStops === 1 ? "delivery" : "deliveries"} completed</p>
          </div>
        )}
      </section>

      {/* Loading */}
      <section aria-labelledby="loading-title" className={`${cardClass} p-4`}>
        {loadingFinished ? (
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check aria-hidden="true" className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <h3 id="loading-title" className="font-bold">Loading complete</h3>
              <p className="text-xs text-slate-500">Finished at {formatTime(trip.loading_timestamps.loading_finished_at) || "—"}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="loading-title" className="font-bold">Warehouse loading</h3>
                <p className="mt-0.5 text-xs text-slate-500">Record each step before you leave the warehouse.</p>
              </div>
              <Building2 aria-hidden="true" className="h-5 w-5 text-[#2678b9]" />
            </div>
            <ol className="mt-4 space-y-1">
              {loadingMilestones.map(({ field, label }, index) => {
                const timestamp = trip.loading_timestamps[field];
                const done = Boolean(timestamp);
                const current = nextMilestone?.field === field;
                return (
                  <li key={field} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${current ? "bg-[#e6f0f9]" : ""}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-500 text-white" : current ? "bg-[#2678b9] text-white" : "bg-slate-100 text-slate-400"}`}>
                      {done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className={`min-w-0 flex-1 text-sm ${done || current ? "font-semibold" : "text-slate-500"}`}>{label}</span>
                    <span className="text-xs text-slate-500">{formatTime(timestamp)}</span>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveLoadingMilestone()}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b2341] px-4 text-sm font-bold text-white transition hover:bg-[#16385f] disabled:opacity-50"
            >
              {statusSaving ? "Saving…" : nextMilestone?.label ?? "Update loading"}
              {!statusSaving && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          </>
        )}
      </section>

      {/* Deliveries */}
      <section aria-labelledby="deliveries-title" className="space-y-3">
        <h3 id="deliveries-title" className="px-1 font-bold">Deliveries</h3>
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

  return (
    <div className="driver-portal min-h-screen bg-[#f4f6f9] text-[#0b2341]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="Alzhen Trucking Services" className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-0.5" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{driverName}</p>
              <p className="text-xs text-slate-500">Alzhen driver</p>
            </div>
          </div>
          <button type="button" onClick={() => setShowLogoutConfirm(true)} aria-label="Log out" title="Log out" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
            <LogOut aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className={`mx-auto max-w-2xl space-y-4 px-4 pt-5 ${showStartBar ? "pb-44" : "pb-10"}`}>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Driver sections" className="grid flex-1 grid-cols-2 rounded-xl bg-slate-200/60 p-1 text-sm font-semibold">
            {([["trips", "My trip"], ["reports", "Activity reports"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={portalTab === key}
                disabled={busy}
                onClick={() => setPortalTab(key)}
                className={`rounded-lg py-2 transition disabled:opacity-50 ${portalTab === key ? "bg-white text-[#0b2341] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {portalTab === "trips" && (
            <button type="button" disabled={busy || tripsLoading} aria-label="Refresh trips" title="Refresh trips" onClick={() => setReloadCount((count) => count + 1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${tripsLoading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {portalTab === "reports" ? (
          <section className={`${cardClass} p-4 sm:p-5`}>
            <OperationsReportsView mode="trucker" />
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
                <button type="button" disabled={tripsLoading} onClick={() => setReloadCount((count) => count + 1)} className="min-h-9 shrink-0 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold hover:bg-red-100 disabled:opacity-50">Try again</button>
              </div>
            )}
            {!tripsLoading && !tripsError && assignedTrips.length === 0 && (
              <div role="status" className={`${cardClass} flex items-start gap-3 p-5`}>
                <Truck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <p className="font-bold">No assigned trips</p>
                  <p className="mt-1 text-sm text-slate-500">Trips from your dispatcher will show up here.</p>
                </div>
              </div>
            )}

            {assignedTrips.length > 0 && selectedTrip && (
              <>
                {tripSwitcher}
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
