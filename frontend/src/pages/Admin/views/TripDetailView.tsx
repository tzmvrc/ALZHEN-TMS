import { useDeferredRealtimeRefresh } from "../../../components/admin/useDeferredRealtimeRefresh";
import { useEffect,useLayoutEffect,useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  History,
  ImagePlus,
  Images,
  ListChecks,
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
  fetchTripEvents,
  fetchTripLineItems,
  fetchTripStops,
  invalidateTripCache,
  type TripChildRecord,
  type TripEvent,
  type TripRecord,
} from "../../../services/trip.service";
import LiveTripMap, { type TripEventTrack, type TripLocationRoute } from "../../../components/admin/LiveTripMap";
import { surface } from "../../../components/admin/dashboardStyles";
import ProductPhotoManager from "../../../components/admin/ProductPhotoManager";
import ReceiptReviewCard from "../../../components/admin/ReceiptReviewCard";
import OperationsTimeline from "../../../components/admin/OperationsTimeline";
import truckBg from "../../../assets/trip-truck.png";
import {
  deleteTripImage,
  fetchTripImages,
  invalidateTripImagesCache,
  uploadTripImage,
  type TripImage,
} from "../../../services/trip-image.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import { RECEIPT_TABLES } from "../../../services/live-activity.service";
import {
  fetchTripOperations,
  type OperationsReportData,
} from "../../../services/operations-report.service";

type BookingPage = {
  rows: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type DetailState = {
  trip: TripRecord;
  stops: TripChildRecord[];
  lineItems: TripChildRecord[];
  events: TripEvent[];
  operations: OperationsReportData;
  bookingRows: Record<string, unknown>[];
  bookingError: string | null;
  truckCapacityCbm: number | null;
  truckCapacityError: string | null;
  sectionErrors: string[];
};

type TruckLookupRow = {
  id: string;
  plate_number: string | null;
  capacity_cbm: number | null;
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

function shortDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function StatusPill({ status, fallback = "Not recorded" }: { status: unknown; fallback?: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.pill}`}
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

function ProductPhotoThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <Package aria-hidden="true" className="h-5 w-5 text-slate-300" />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-14 w-14 rounded-xl bg-[#f2f6fa] object-cover"
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
    <div className={`${surface.card} flex h-full flex-col p-5`}>
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
      <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100">
        {photos.length > 0 ? (
          <>
            <img
              key={photos[active]?.id}
              src={photos[active]?.signed_url}
              alt={`Truck photo ${active + 1} of ${photos.length}`}
              className="h-full w-full object-cover"
            />
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
/* Load gauge                                                          */
/* ------------------------------------------------------------------ */
function LoadGauge({ percentage }: { percentage: number }) {
  const radius = 60;
  const stroke = 12;
  const circumference = Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const color = percentage > 90 ? "#ef4444" : percentage > 70 ? "#f59e0b" : "#2678b9";

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="160" height="90" viewBox="0 0 160 90" className="overflow-visible" aria-hidden="true">
        <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="#e2e8f0" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d="M 20 80 A 60 60 0 0 1 140 80"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute bottom-0 flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums text-[#0b2341]">{percentage}%</span>
        <span className="text-[10px] font-medium text-slate-500">Loaded</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vehicle card                                                        */
/* ------------------------------------------------------------------ */
const TRUCK_SLOTS = 12;

function VehicleCard({
  plate,
  status,
  cargoRows,
  selectedItem,
  onSelectItem,
  truckCapacityCbm,
  totalCbm,
}: {
  plate: string;
  status: unknown;
  cargoRows: Record<string, unknown>[];
  selectedItem: Record<string, unknown> | null;
  onSelectItem: (item: Record<string, unknown>) => void;
  truckCapacityCbm: number | null;
  totalCbm: number;
}) {
  const slots = Array.from({ length: TRUCK_SLOTS }, (_, i) => cargoRows[i] ?? null);
  const remainingCbm = truckCapacityCbm !== null ? Math.max(0, truckCapacityCbm - totalCbm) : null;
  const loadPercentage =
    truckCapacityCbm !== null && truckCapacityCbm > 0
      ? Math.min(100, Math.round((totalCbm / truckCapacityCbm) * 100))
      : 0;

  return (
    <div className={`${surface.card} flex h-full flex-col p-5`}>
      <CardHeader
        icon={<Truck />}
        title="Vehicle & load"
        right={
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <span className="truncate font-semibold text-[#0b2341]">{plate}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="shrink-0 font-semibold text-emerald-600">
              {valueText(status, "Status unknown").replaceAll("_", " ")}
            </span>
          </span>
        }
      />

      <div className="mt-4 grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_190px]">
        <div className="flex min-w-0 flex-col justify-center">
          <div className="relative w-full overflow-hidden rounded-2xl bg-[#f8fafc] p-2">
            <img src={truckBg} alt="Delivery truck side view" className="h-auto w-full object-contain" />
            <div className="absolute bottom-[40%] left-[28%] right-[4%] top-[20%] grid grid-cols-6 grid-rows-2 gap-1 p-3">
              {slots.map((item, index) => {
                const isSelected = Boolean(selectedItem && item && selectedItem.id === item.id);
                const itemName = item
                  ? valueText(item.product_name ?? item.item_name ?? `Item ${index + 1}`)
                  : "";
                const itemCbm = item?.cbm;
                const itemCbmLabel =
                  itemCbm === null || itemCbm === undefined || itemCbm === ""
                    ? "CBM not set"
                    : Number.isFinite(Number(itemCbm))
                      ? `${formatNumber(Number(itemCbm))} CBM`
                      : `${String(itemCbm)} CBM`;
                const base =
                  "relative flex flex-col items-center justify-center rounded-md border text-[9px] font-medium transition-all";
                if (!item) {
                  return (
                    <div key={index} className={`${base} border-dashed border-slate-300/70 bg-white/60`}>
                      <span className="text-slate-300">+</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onSelectItem(item)}
                    aria-pressed={isSelected}
                    aria-label={`Select ${itemName}`}
                    className={`${base} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400"
                        : "border-slate-300 bg-white/95 hover:border-slate-400"
                    }`}
                  >
                    <span className="line-clamp-2 text-center leading-tight">{itemName}</span>
                    <span className="text-[8px] text-slate-500">{itemCbmLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            {cargoRows.length} cargo line{cargoRows.length === 1 ? "" : "s"}
            {cargoRows.length > TRUCK_SLOTS && <> · showing {TRUCK_SLOTS} of {cargoRows.length}</>}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex justify-center rounded-2xl bg-[#f2f6fa] px-3 pb-3 pt-4">
            <LoadGauge percentage={loadPercentage} />
          </div>
          <dl className="grid gap-2">
            {[
              ["Max CBM", truckCapacityCbm !== null ? formatNumber(truckCapacityCbm) : "—"],
              ["Load CBM", formatNumber(totalCbm)],
              ["Remaining", remainingCbm !== null ? formatNumber(remainingCbm) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2 rounded-xl border border-slate-200/80 px-3 py-2">
                <dt className="text-[11px] text-slate-500">{label}</dt>
                <dd className="text-sm font-bold tabular-nums text-[#0b2341]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-[#f2f6fa] px-4 py-3 text-xs">
        {selectedItem ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="min-w-0 truncate text-sm font-semibold text-[#0b2341]">
              {valueText(selectedItem.product_name ?? selectedItem.item_name)}
            </p>
            <p className="text-slate-500">
              Qty {valueText(selectedItem.quantity, "—")} · {valueText(selectedItem.cbm, "—")} CBM
            </p>
          </div>
        ) : (
          <p className="text-slate-500">Select a cargo slot on the truck to see its details.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */
function TripDetailSkeleton({ onBack }: { onBack: () => void }) {
  const block = "animate-pulse rounded-2xl bg-slate-200/80";
  const card = `${surface.card} p-5`;

  return (
    <div aria-label="Loading trip details" aria-busy="true" className="w-full space-y-4">
      <header className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-4 text-xs font-semibold text-[#0b2341] shadow-sm">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to trips
        </button>
      </header>

      <section aria-hidden="true" className={`${card} grid gap-6 xl:grid-cols-12`}>
        <div className="space-y-4 xl:col-span-5">
          <div className={`${block} h-3 w-24`} />
          <div className={`${block} h-8 w-56`} />
          <div className={`${block} h-2 w-full`} />
          <div className={`${block} h-4 w-4/5`} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:col-span-7">
          {Array.from({ length: 8 }, (_, index) => <div key={index} className={`${block} h-16`} />)}
        </div>
      </section>

      <section aria-hidden="true" className="grid grid-cols-1 gap-4 xl:h-[480px] xl:grid-cols-12">
        <div className={`${block} min-h-[300px] xl:col-span-8`} />
        <div className={`${card} space-y-4 xl:col-span-4`}>
          <div className={`${block} h-9 w-full rounded-full`} />
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex gap-3"><div className={`${block} h-8 w-8 rounded-full`} /><div className="flex-1 space-y-2"><div className={`${block} h-3 w-3/4`} /><div className={`${block} h-3 w-1/2`} /></div></div>)}
        </div>
      </section>

      <section aria-hidden="true" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className={`${block} min-h-[320px] xl:col-span-7`} />
        <div className={`${block} min-h-[320px] xl:col-span-5`} />
      </section>
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
  const [receiptTick, setReceiptTick] = useState(0);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [stopSelectionChanged, setStopSelectionChanged] = useState(false);
  const [selectedCargoItem, setSelectedCargoItem] = useState<Record<string, unknown> | null>(null);
  const [photoProduct, setPhotoProduct] = useState<{ id: string; name: string } | null>(null);
  const [viewProduct, setViewProduct] = useState<Record<string, unknown> | null>(null);
  const [productPhotoOverrides, setProductPhotoOverrides] = useState<Record<string, string | null>>({});
  const [sidePanel, setSidePanel] = useState<"stops" | "activity">("stops");
  const requestKey = `${accessToken ?? "no-session"}:${tripId}:${retry}`;
  const realtimeGate = useDeferredRealtimeRefresh(() => { invalidateTripCache(tripId); setRetry((value) => value + 1); }, Boolean(selectedCargoItem || photoProduct || viewProduct));

  useEffect(() => subscribeToAdminRealtime((event) => {
    if (event.kind === "batch") {
      if (event.tables.some((table) => (RECEIPT_TABLES as readonly string[]).includes(table))) setReceiptTick((value) => value + 1);
      if (event.tables.some((table) => ["trips", "trip_stops", "trip_line_items", "trip_events", "trip_truck_assignments", "billings", "loading_reports", "unloading_reports", "backloads", "offloads", "customers", "customer_stores", "warehouses", "drivers", "trucks", "trucking_companies"].includes(table))) {
        realtimeGate.request();
      }
      return;
    }
    if (event.kind === "resume") {
      realtimeGate.request();

      return;
    }
    const tripTables = ["trips", "trip_stops", "trip_line_items", "trip_events", "trip_truck_assignments", "billings", "loading_reports", "unloading_reports", "backloads", "offloads"];
    const receiptTables: readonly string[] = RECEIPT_TABLES;
    if (event.kind === "recovered") {
      if (receiptTables.includes(event.table)) setReceiptTick((value) => value + 1);
      if (!tripTables.includes(event.table)) return;
    } else {
      const { table, new: next, old } = event.payload;
      /* A receipt photo or its text changed: refresh just the receipt card, not the whole trip. */
      if (receiptTables.includes(table) && [next?.trip_id, old?.trip_id].includes(tripId)) {
        setReceiptTick((value) => value + 1);
      }
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
        const tripResponse = await fetchTripDetail(accessToken, tripId);
        if(!active)return;
        const cached=previousDetail.current.scope===scope?previousDetail.current.value:null;
        // Render authorized core data without waiting for optional section/report reads.
        setDetailState({scope,value:{stops:[],lineItems:[],events:[],operations:{trips:[],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],event_rows:[]},bookingRows:[],bookingError:null,truckCapacityCbm:null,truckCapacityError:null,sectionErrors:[],...cached,trip:{...tripResponse.trip,warehouse_name:tripResponse.warehouse?.name,warehouse_code:tripResponse.warehouse?.code,trip_type:tripResponse.trip_type?.name}}});
        const [stopsResult, itemsResult, eventsResult, operationsResult] = await Promise.allSettled([
          fetchTripStops(accessToken, tripId),
          fetchTripLineItems(accessToken, tripId),
          fetchTripEvents(accessToken, tripId),
          fetchTripOperations(accessToken, tripId),
        ]);
        const childResults = [stopsResult, itemsResult, eventsResult, operationsResult];
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
        const events = eventsResult.status === "fulfilled" ? eventsResult.value : previous?.events??[];
        const operations = operationsResult.status === "fulfilled" ? operationsResult.value : previous?.operations??{
          trips: [], trip_options: [], stops: [], loading: [], unloading: [], backloads: [], offloads: [], event_rows: [],
        };
        const sectionErrors = childResults.flatMap((result, index) => {
          if (result.status !== "rejected") return [];
          const sections = ["Stops", "Products", "Events", "Operational reports"];
          const message = result.reason instanceof Error ? result.reason.message : "Unavailable";
          return [`${sections[index]}: ${message}`];
        });
        const params = new URLSearchParams({
          page: "1",
          limit: "500",
          trip_id: tripId,
          sort_by: "loading_date",
          sort_order: "desc",
        });
        let bookingRows: Record<string, unknown>[] = previous?.bookingRows??[];
        let bookingError: string | null = null;
        let truckCapacityCbm: number | null = previous?.truckCapacityCbm??null;
        let truckCapacityError: string | null = null;
        try {
          const bookingResponse = await apiGetCached<ApiResponse<BookingPage>>(
            `/reports/trip-booking?${params.toString()}`,
            accessToken,undefined,undefined,20_000,
          );
          if (!bookingResponse.success || !bookingResponse.data) {
            throw new Error(bookingResponse.message ?? "Trip report enrichment unavailable.");
          }
          bookingRows = [...bookingResponse.data.rows];
          for (let page = 2; page <= bookingResponse.data.pagination.totalPages; page += 1) {
            params.set("page", String(page));
            const next = await apiGetCached<ApiResponse<BookingPage>>(
              `/reports/trip-booking?${params.toString()}`, accessToken,undefined,undefined,20_000,
            );
            if (!next.success || !next.data) throw new Error(next.message ?? "Trip report enrichment unavailable.");
            bookingRows.push(...next.data.rows);
          }
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) throw cause;
          bookingError = cause instanceof Error ? cause.message : "Trip report enrichment unavailable.";
        }
        const truckPlate = String(bookingRows.find((row) => row.plate_number)?.plate_number ?? "").trim();
        if (truckPlate) {
          try {
            const truckResponse = await apiGetCached<ApiResponse<TruckLookupRow[]>>(
              `/lookups/trucks?q=${encodeURIComponent(truckPlate)}`,
              accessToken,
            );
            if (!truckResponse.success || !truckResponse.data) {
              throw new Error(truckResponse.message ?? "Unable to load truck capacity.");
            }
            const matchedTruck = truckResponse.data.find(
              (row) => row.plate_number?.trim().toLowerCase() === truckPlate.toLowerCase(),
            );
            if (typeof matchedTruck?.capacity_cbm === "number" && matchedTruck.capacity_cbm > 0) {
              truckCapacityCbm = matchedTruck.capacity_cbm;
            }
          } catch (cause) {
            if (cause instanceof ApiError && cause.status === 401) throw cause;
            truckCapacityError = cause instanceof Error ? cause.message : "Truck capacity is unavailable.";
          }
        }
        if (!active) return;
        const nextDetail:DetailState={
          trip: {
            ...tripResponse.trip,
            warehouse_name: tripResponse.warehouse?.name,
            warehouse_code: tripResponse.warehouse?.code,
            trip_type: tripResponse.trip_type?.name,
          },
          stops,
          lineItems,
          events,
          operations,
          bookingRows,
          bookingError,
          truckCapacityCbm,
          truckCapacityError,
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
    : bookingRows.filter((row) => row.trip_line_item_id || row._trip_line_item_id || row.product_id || row._product_id);
  const reportRows = bookingRows;
  const orderedEvents = (detail?.events ?? [])
    .slice()
    .sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time));
  const mapTrack: TripEventTrack[] = trip ? [{ trip, events: detail?.events ?? [] }] : [];
  const mapLocationIds = [
    ...(typeof trip?.warehouse_id === "string" ? [trip.warehouse_id] : []),
    ...stops.flatMap((stop) => typeof stop.store_id === "string" ? [stop.store_id] : []),
  ];
  const mapOriginWarehouseId = typeof trip?.warehouse_id === "string" ? trip.warehouse_id : "";
  const mapDestinationStoreIds = [...new Set(stops
    .flatMap((stop) => typeof stop.store_id === "string" ? [stop.store_id] : []))];
  const mapLocationRoutes: TripLocationRoute[] = mapOriginWarehouseId && mapDestinationStoreIds.length
    ? [{
        tripId,
        tripLabel: dispatchNumber,
        originWarehouseId: mapOriginWarehouseId,
        destinationStoreIds: mapDestinationStoreIds,
      }]
    : [];
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
  const lineItemCount = productRows.length;
  const driverName = getBookingValue(reportRows, "driver_name");
  const plate = getBookingValue(reportRows, "plate_number", "No plate recorded");
  const placeholder = isLoading&&!detail ? "…" : undefined;
  const timelineEvents = orderedEvents.slice().reverse();
  const nextStopIndex = stops.findIndex((stop) => !stopIsDone(stop));
  const company = getBookingValue(reportRows, "trucking_company");
  const detailFacts: Array<{ label: string; value: string; sub?: string }> = [
    { label: "Driver", value: driverName, sub: company !== "Not recorded" ? company : undefined },
    { label: "Vehicle", value: plate },
    { label: "Loading date", value: shortDate(trip?.loading_date) },
    { label: "Est. delivery", value: shortDate(trip?.estimated_delivery_date) },
  ];
  const cargoFacts: Array<{ label: string; value: string }> = [
    { label: "Items", value: placeholder ?? String(lineItemCount) },
    { label: "Quantity", value: placeholder ?? formatNumber(totalQty) },
    { label: "Total CBM", value: placeholder ?? formatNumber(totalCbm) },
    { label: "Events", value: placeholder ?? String(orderedEvents.length) },
  ];
  const sideTabs = [
    { key: "stops" as const, label: "Stops", count: stops.length, Icon: ListChecks },
    { key: "activity" as const, label: "Activity", count: orderedEvents.length, Icon: History },
  ];

  return (
    <div className="space-y-4">
      {isLoading&&detail&&<p role="status" className="text-xs text-slate-500">Loading remaining trip details…</p>}
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

      {/* Summary: what trip is this, where is it at, who is driving, how much is on board */}
      <section className={`${surface.card} p-5 sm:p-6`}>
        <div className="grid gap-6 xl:grid-cols-12 xl:gap-8">
          <div className="min-w-0 xl:col-span-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Trip {valueText(trip?.trip_number)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[#0b2341]">{dispatchNumber}</h1>
              <StatusPill status={trip?.status} fallback="Loading" />
            </div>

            <ul className="mt-5 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2 border-[#0b2341] bg-white" />
                <span className="min-w-0">
                  <span className="block text-[11px] text-slate-400">From</span>
                  <span className="break-words text-slate-700">{originName}</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#2678b9]" />
                <span className="min-w-0">
                  <span className="block text-[11px] text-slate-400">To</span>
                  <span className="line-clamp-2 break-words text-slate-700">{destinationText}</span>
                </span>
              </li>
            </ul>

            <div className="mt-5">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-slate-600">
                  {placeholder ?? `${doneStops} of ${stops.length} stops completed`}
                </span>
                <span className="font-bold tabular-nums text-[#0b2341]">{placeholder ?? `${progress}%`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#e6f0f9]">
                <div
                  className="h-full rounded-full bg-[#ffd43b] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:col-span-7 xl:grid-rows-2">
            {detailFacts.map(({ label, value, sub }) => (
              <div key={label} className="min-w-0 rounded-2xl bg-[#f2f6fa] px-4 py-3">
                <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
                <dd className="mt-1 truncate text-sm font-semibold text-[#0b2341]" title={value}>{value}</dd>
                {sub && <p className="mt-0.5 truncate text-[11px] text-slate-400" title={sub}>{sub}</p>}
              </div>
            ))}
            {cargoFacts.map(({ label, value }) => (
              <div key={label} className="min-w-0 rounded-2xl border border-slate-200/80 px-4 py-3">
                <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
                <dd className="mt-1 text-xl font-bold leading-none tabular-nums text-[#0b2341]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {Boolean(trip?.remarks) && (
          <p className={`${surface.inner} mt-5 px-4 py-3 text-xs text-slate-600`}>
            {String(trip?.remarks)}
          </p>
        )}
      </section>

      {/* Where is it now: live map | stops + activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <LiveTripMap tracks={mapTrack} locationIds={mapLocationIds} tripLocationRoutes={mapLocationRoutes} focusTripId={tripId} eventLoadError={false} height={440} fillHeight />
        </div>

        <section className={`${surface.card} relative min-w-0 xl:col-span-4`}>
          <div className="flex max-h-[520px] min-h-[320px] flex-col p-5 xl:absolute xl:inset-0 xl:max-h-none">
          <div role="tablist" aria-label="Stops and activity" className="flex shrink-0 items-center gap-1 rounded-full bg-[#eef3f8] p-1">
            {sideTabs.map(({ key, label, count, Icon }) => {
              const isActive = sidePanel === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSidePanel(key)}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-white text-[#0b2341] shadow-[0_2px_8px_-2px_rgba(11,35,65,0.2)]"
                      : "text-slate-500 hover:text-[#0b2341]"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${isActive ? "bg-[#0b2341] text-white" : "bg-white text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {sidePanel === "stops" ? (
            stops.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                {placeholder ?? "No stops recorded for this trip."}
              </p>
            ) : (
              <ul role="tabpanel" className="mt-3 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto pr-1">
                {stops.map((stop, index) => {
                  const key = stopKey(stop, index);
                  const match = rowsForStop(String(stop.id ?? ""))[0] ?? {};
                  const done = stopIsDone(stop);
                  const isNext = index === nextStopIndex;
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
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : timelineEvents.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No events recorded.</p>
          ) : (
            <ol role="tabpanel" className="relative ml-2 mt-5 min-h-0 flex-1 overflow-y-auto border-l-2 border-[#ffd43b]/70 pl-5 pr-1">
              {timelineEvents.map((event, index) => (
                <li key={event.id} className="relative mb-5 last:mb-0">
                  <span
                    className={`timeline-dot absolute -left-[28px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                      index === 0 ? "bg-[#ffd43b] text-[#ffd43b]" : "bg-[#2678b9] text-[#2678b9]"
                    }`}
                  />
                  <p className="text-sm font-semibold capitalize text-[#0b2341]">
                    {event.event_type.replaceAll("_", " ").toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                    {dateText(event.event_time, true)}
                  </p>
                  {event.notes && <p className="mt-1 text-xs text-slate-600">{event.notes}</p>}
                </li>
              ))}
            </ol>
          )}
          </div>
        </section>
      </div>

      {/* Load & photos: reference detail, below the live picture */}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <VehicleCard
            plate={plate}
            status={trip?.status}
            cargoRows={cargoRows}
            selectedItem={selectedCargoItem}
            onSelectItem={setSelectedCargoItem}
            truckCapacityCbm={detail?.truckCapacityCbm ?? null}
            totalCbm={totalCbm}
          />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <TripGallery key={tripId} plate={plate} tripId={tripId} accessToken={accessToken} />
        </div>
      </div>

      {/* Operational report history is loaded through the authenticated,
          trip-scoped API so each stop remains independently identified. */}
      <section className={`${surface.card} min-w-0 p-5`}>
        <OperationsTimeline
          tripId={tripId}
          loading={detail?.operations.loading ?? []}
          stops={stops.map((stop, index) => {
            const stopId = String(stop.id ?? "");
            const timeline = detail?.operations.stops.find((item) => item.id === stopId);
            return {
              id: stopId || String(index),
              label: `Stop ${String(stop.stop_sequence ?? index + 1)}`,
              storeName: valueText(rowsForStop(stopId)[0]?.store_name, "Store not recorded"),
              arrival: timeline?.arrival_time,
              start: timeline?.start_unloading_time,
              finish: timeline?.finish_unloading_time,
              remarks: typeof timeline?.remarks === "string" && timeline.remarks ? timeline.remarks : null,
            };
          })}
          backloads={detail?.operations.backloads ?? []}
          offloads={detail?.operations.offloads ?? []}
          stopLabel={(stopId) => stopLabels[stopId] ?? null}
          error={detail?.sectionErrors.find((message) => message.startsWith("Operational reports:")) ?? null}
        />
      </section>

      {/* Products */}
      <section className={`${surface.card} min-w-0 overflow-hidden`}>
        <header className="flex flex-col gap-3 px-5 pb-3 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <CardHeader
            icon={<Package />}
            title="Products"
            right={
              <span className="rounded-full bg-[#0b2341] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                {productRows.length}
              </span>
            }
          />
          <div
            role="group"
            aria-label="Filter products by stop"
            className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[#eef3f8] p-1"
          >
            {[
              { key: null as string | null, label: "All" },
              ...stops.map((stop, index) => ({ key: String(stop.id ?? `stop-${index}`), label: `Stop ${stopKey(stop, index)}` })),
            ].map(({ key, label }) => {
              const count = key === null ? productRows.length : productRows.filter(
                (row) => String(row.trip_stop_id ?? row._trip_stop_id ?? "") === key,
              ).length;
              const isActive = activeStopId === key;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => { setStopSelectionChanged(true); setSelectedStop(key); }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? "bg-white text-[#0b2341] shadow-[0_2px_8px_-2px_rgba(11,35,65,0.2)]"
                      : "text-slate-500 hover:text-[#0b2341]"
                  }`}
                >
                  {label}
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </header>
        <div className="overflow-x-auto bg-[#f2f6fa] px-3 pb-3">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left text-xs">
            <thead className="text-[11px] font-semibold text-slate-500">
              <tr>
                <th className="px-4 pb-1 pt-3">Product</th>
                <th className="px-4 pb-1 pt-3">SKU / Model</th>
                <th className="px-4 pb-1 pt-3">Store</th>
                <th className="px-4 pb-1 pt-3">DR number</th>
                <th className="px-4 pb-1 pt-3 text-right">Quantity</th>
                <th className="px-4 pb-1 pt-3 text-right">CBM</th>
                <th className="px-4 pb-1 pt-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500">
                    {activeStopId ? "No products recorded for this stop." : "No product rows available."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => {
                  const productId = String(row.product_id ?? row._product_id ?? "");
                  const productName = valueText(row.product_name, "Product not recorded");
                  const photoUrl = Object.hasOwn(productPhotoOverrides, productId)
                    ? productPhotoOverrides[productId]
                    : typeof row.product_photo_url === "string"
                      ? row.product_photo_url
                      : null;
                  return (
                    <tr
                      key={String(row.trip_line_item_id ?? row.id ?? `${tripId}-item-${index}`)}
                      className="bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04)]"
                    >
                      <td className="rounded-l-2xl px-4 py-3.5 font-semibold text-[#0b2341]">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f2f6fa]">
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
                          <button
                            type="button"
                            onClick={() => setViewProduct(row)}
                            aria-label={`View appliance details for ${productName}`}
                            className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left font-semibold text-[#0b2341] transition-colors hover:text-[#2678b9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
                          >
                            {productName}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{valueText(row.sku ?? row.model_code)}</td>
                      <td className="px-4 py-3.5 text-slate-600">{valueText(row.store_name)}</td>
                      <td className="px-4 py-3.5 text-slate-700">{valueText(row.dr_number)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{valueText(row.quantity)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{valueText(row.cbm)}</td>
                      <td className="rounded-r-2xl px-4 py-3.5 text-right">
                        <StatusPill status={row.delivery_status} fallback="Pending" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center gap-2 px-5 py-3 text-[11px] text-slate-500">
          <Package aria-hidden="true" className="h-3.5 w-3.5 text-[#2678b9]" />
          {visibleRows.length} {visibleRows.length === 1 ? "line" : "lines"} ·{" "}
          {formatNumber(sumOf(visibleRows, "quantity"))} units · {formatNumber(sumOf(visibleRows, "cbm"))} CBM
        </footer>
      </section>

      {/* Delivery receipts (OCR text for admin review) */}
      <ReceiptReviewCard tripId={tripId} accessToken={accessToken} stopLabels={stopLabels} refreshKey={retry + receiptTick} />

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
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]"
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
    </div>
  );
}
