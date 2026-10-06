import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  ImagePlus,
  Package,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { ApiError, apiGet, type ApiResponse } from "../../../services/api.service";
import {
  fetchTripDetail,
  fetchTripEvents,
  fetchTripLineItems,
  fetchTripStops,
  type TripChildRecord,
  type TripEvent,
  type TripRecord,
} from "../../../services/trip.service";
import LiveTripMap, { type TripEventTrack } from "../../../components/admin/LiveTripMap";
import { surface } from "../../../components/admin/dashboardStyles";
import ProductPhotoManager from "../../../components/admin/ProductPhotoManager";
import truckBg from "../../../assets/trip-truck.png";
import {
  deleteTripImage,
  fetchTripImages,
  uploadTripImage,
  type TripImage,
} from "../../../services/trip-image.service";

type BookingPage = {
  rows: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type DetailState = {
  trip: TripRecord;
  stops: TripChildRecord[];
  lineItems: TripChildRecord[];
  events: TripEvent[];
  bookingRows: Record<string, unknown>[];
  bookingError: string | null;
  truckCapacityCbm: number | null;
  truckCapacityError: string | null;
  sectionErrors: string[];
};

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

type TruckLookupRow = {
  id: string;
  plate_number: string | null;
  capacity_cbm: number | null;
};

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

const formatNumber = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function statusTone(status: unknown) {
  const s = String(status ?? "").toUpperCase();
  if (/COMPLET|DELIVER|FINISH/.test(s))
    return { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  if (/DELAY/.test(s))
    return { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  if (/CANCEL|FAIL/.test(s))
    return { pill: "bg-rose-50 text-rose-700", dot: "bg-rose-500" };
  if (/PROGRESS|TRANSIT|LOAD|ONGOING|DISPATCH/.test(s))
    return { pill: "bg-[#e6f0f9] text-[#1d5f94]", dot: "bg-[#2678b9]" };
  return { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
}

function StatusPill({ status, fallback = "Not recorded" }: { status: unknown; fallback?: string }) {
  const tone = statusTone(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone.pill}`}>
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

/* Photo gallery: one large photo, thumbnails underneath. Photos never sit behind other cards. */
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
  const fileInput = useRef<HTMLInputElement>(null);
  const photos = savedPhotos?.map((photo) => photo.signed_url) ?? [];
  const activeSavedPhoto = savedPhotos?.length ? savedPhotos[active] : undefined;

  useEffect(() => {
    if (!accessToken) return;
    let current = true;
    void fetchTripImages(accessToken, tripId).then(
      (images) => {
        if (!current) return;
        setSavedPhotos(images);
        setActive(0);
        setPhotoError(null);
      },
      (cause: unknown) => {
        if (!current) return;
        setSavedPhotos([]);
        setPhotoError(
          cause instanceof Error ? cause.message : "Unable to load saved trip photos.",
        );
      },
    );
    return () => {
      current = false;
    };
  }, [accessToken, tripId]);

  const go = (step: number) => {
    if (photos.length < 2) return;
    setActive((current) => (current + step + photos.length) % photos.length);
  };
  const navBtn =
    "absolute top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0b2341] shadow-[0_2px_8px_rgba(11,35,65,0.18)] transition hover:bg-[#ffd43b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40";

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !accessToken) return;
    const selectedFiles = Array.from(files);
    setPhotoBusy(true);
    setPhotoError(null);
    let uploaded = 0;
    try {
      for (const file of selectedFiles) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
          throw new Error("Choose JPEG, PNG, or WebP photos up to 5 MB each.");
        }
        const saved = await uploadTripImage(accessToken, tripId, file);
        setSavedPhotos((current) => {
          const updated = [...(current ?? []), saved];
          setActive(updated.length - 1);
          return updated;
        });
        uploaded += 1;
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to upload trip photo.";
      setPhotoError(uploaded > 0 ? `${message} ${uploaded} photo${uploaded === 1 ? "" : "s"} were saved.` : message);
    } finally {
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
      setActive((current) => Math.max(0, Math.min(current, (savedPhotos?.length ?? 1) - 2)));
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : "Unable to delete trip photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className={`${surface.card} p-3`}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100">
        {photos.length > 0 ? (
          <>
            <img
              key={photos[active]}
              src={photos[active]}
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
          <label className={`flex h-full cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 px-6 text-center transition hover:border-[#2678b9] hover:bg-[#e6f0f9]/40 ${photoBusy || !accessToken ? "pointer-events-none opacity-60" : ""}`}>
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
            key={photo}
            type="button"
            aria-label={`Show photo ${index + 1}`}
            aria-pressed={index === active}
            onClick={() => setActive(index)}
            style={{ flex: "0 0 calc((100% - 1.5rem) / 4)" }}
            className={`aspect-[4/3] snap-start overflow-hidden rounded-xl bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 ${
              index === active ? "ring-2 ring-[#ffd43b] ring-offset-2" : "opacity-60 hover:opacity-100"
            }`}>
            <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {photos.length > 0 && (
        <label className={`${surface.chip} ${photoBusy || !accessToken ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          <ImagePlus aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          {photoBusy ? "Saving photo…" : "Add photos"}
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
        <span className="text-[10px] text-slate-400">JPEG, PNG, or WebP · up to 5 MB each</span>
      </div>
      {photoError && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {photoError}
        </p>
      )}
    </div>
  );
}

// --- Speedometer Gauge Component ---
function LoadGauge({ percentage }: { percentage: number }) {
  const radius = 60;
  const stroke = 12;
  const circumference = Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const color = percentage > 90 ? "#ef4444" : percentage > 70 ? "#f59e0b" : "#2678b9";

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="160" height="90" viewBox="0 0 160 90" className="overflow-visible">
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <path
          d="M 20 80 A 60 60 0 0 1 140 80"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
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

// --- Truck Visualization Component ---
function TruckVisualization({
  cargoRows,
  selectedItem,
  onSelectItem,
  truckCapacityCbm,
  totalCbm,
}: {
  cargoRows: Record<string, unknown>[];
  selectedItem: Record<string, unknown> | null;
  onSelectItem: (item: Record<string, unknown>) => void;
  truckCapacityCbm: number | null;
  totalCbm: number;
}) {
  const totalSlots = 12;
  const slots = Array.from({ length: totalSlots }, (_, i) => cargoRows[i] || null);
  const remainingCbm = truckCapacityCbm !== null ? Math.max(0, truckCapacityCbm - totalCbm) : null;
  const loadPercentage = truckCapacityCbm !== null && truckCapacityCbm > 0
    ? Math.min(100, Math.round((totalCbm / truckCapacityCbm) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full overflow-hidden rounded-2xl bg-[#f8fafc] p-2">
        <img
          src={truckBg}
          alt="Delivery truck side view"
          className="w-full h-auto object-contain"
        />
        <div className="absolute left-[28%] right-[4%] top-[20%] bottom-[40%] grid grid-cols-6 grid-rows-2 gap-1 p-3">
          {slots.map((item, index) => {
            const isSelected = selectedItem && item && selectedItem.id === item.id;
            const hasItem = !!item;
            const itemName = item ? valueText(item.product_name ?? item.item_name ?? `Item ${index + 1}`) : "";
            const itemCbm = item ? Number(item.cbm) : 0;
            return (
              <div
                key={index}
                onClick={() => item && onSelectItem(item)}
                className={`relative flex flex-col items-center justify-center rounded-md border text-[8px] font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400"
                    : hasItem
                      ? "border-slate-300 bg-white/95 hover:border-slate-400"
                      : "border-dashed border-slate-300/70 bg-white/60"
                }`}
              >
                {hasItem ? (
                  <>
                    <span className="line-clamp-2 text-center leading-tight">{itemName}</span>
                    {itemCbm > 0 && (
                      <span className="text-[7px] text-slate-500">{formatNumber(itemCbm)} CBM</span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-300">+</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-6 px-4">
        <div className="shrink-0">
          <LoadGauge percentage={loadPercentage} />
        </div>

        <div className="grid flex-1 grid-cols-3 gap-3">
          <div className="flex flex-col items-center rounded-2xl bg-[#f2f6fa] p-3 text-center">
            <span className="text-[10px] font-medium text-slate-500">Max CBM</span>
            <span className="text-lg font-bold tabular-nums text-[#0b2341]">
              {truckCapacityCbm !== null ? formatNumber(truckCapacityCbm) : "—"}
            </span>
          </div>
          <div className="flex flex-col items-center rounded-2xl bg-[#f2f6fa] p-3 text-center">
            <span className="text-[10px] font-medium text-slate-500">Load CBM</span>
            <span className="text-lg font-bold tabular-nums text-[#2678b9]">
              {formatNumber(totalCbm)}
            </span>
          </div>
          <div className="flex flex-col items-center rounded-2xl bg-[#f2f6fa] p-3 text-center">
            <span className="text-[10px] font-medium text-slate-500">Remaining</span>
            <span className="text-lg font-bold tabular-nums text-emerald-600">
              {remainingCbm !== null ? formatNumber(remainingCbm) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TripDetailView({
  tripId,
  onBack,
}: {
  tripId: string;
  onBack: () => void;
}) {
  const { accessToken, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [selectedCargoItem, setSelectedCargoItem] = useState<Record<string, unknown> | null>(null);
  const [photoProduct, setPhotoProduct] = useState<{ id: string; name: string } | null>(null);
  const [viewProduct, setViewProduct] = useState<Record<string, unknown> | null>(null);
  const [productPhotoOverrides, setProductPhotoOverrides] = useState<Record<string, string | null>>({});
  const requestKey = `${accessToken ?? "no-session"}:${tripId}:${retry}`;

  useEffect(() => {
    if (!accessToken) {
      navigate("/login", { replace: true });
      return;
    }

    let active = true;
    void (async () => {
      try {
        const tripResponse = await fetchTripDetail(accessToken, tripId);
        const [stopsResult, itemsResult, eventsResult] = await Promise.allSettled([
          fetchTripStops(accessToken, tripId),
          fetchTripLineItems(accessToken, tripId),
          fetchTripEvents(accessToken, tripId),
        ]);
        const childResults = [stopsResult, itemsResult, eventsResult];
        const authFailure = childResults.find(
          (result) => result.status === "rejected" &&
            result.reason instanceof ApiError && result.reason.status === 401,
        );
        if (authFailure?.status === "rejected") throw authFailure.reason;
        const stops = stopsResult.status === "fulfilled" ? stopsResult.value : [];
        const lineItems = itemsResult.status === "fulfilled" ? itemsResult.value : [];
        const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
        const sectionErrors = childResults.flatMap((result, index) => {
          if (result.status !== "rejected") return [];
          const sections = ["Stops", "Products", "Events"];
          const message = result.reason instanceof Error ? result.reason.message : "Unavailable";
          return [`${sections[index]}: ${message}`];
        });
        const dispatchNumber = String(tripResponse.trip.dispatch_number ?? "");
        const params = new URLSearchParams({
          page: "1",
          limit: "100",
          dispatch_number: dispatchNumber,
          sort_by: "loading_date",
          sort_order: "desc",
        });
        let bookingRows: Record<string, unknown>[] = [];
        let bookingError: string | null = null;
        let truckCapacityCbm: number | null = null;
        let truckCapacityError: string | null = null;
        try {
          const bookingResponse = await apiGet<ApiResponse<BookingPage>>(
            `/reports/trip-booking?${params.toString()}`,
            accessToken,
          );
          if (!bookingResponse.success || !bookingResponse.data) {
            throw new Error(bookingResponse.message ?? "Trip report enrichment unavailable.");
          }
          bookingRows = bookingResponse.data.rows.filter(
            (row) => String(row.dispatch_number ?? "") === dispatchNumber,
          );
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) throw cause;
          bookingError = cause instanceof Error ? cause.message : "Trip report enrichment unavailable.";
        }
        const truckPlate = String(bookingRows.find((row) => row.plate_number)?.plate_number ?? "").trim();
        if (truckPlate) {
          try {
            const truckResponse = await apiGet<ApiResponse<TruckLookupRow[]>>(
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
            truckCapacityError =
              cause instanceof Error ? cause.message : "Truck capacity is unavailable.";
          }
        }
        if (!active) return;
        setDetail({
          trip: tripResponse.trip,
          stops,
          lineItems,
          events,
          bookingRows,
          bookingError,
          truckCapacityCbm,
          truckCapacityError,
          sectionErrors,
        });
      } catch (cause) {
        if (!active) return;
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
  }, [accessToken, navigate, refreshSession, requestKey, tripId]);

  const isLoading = Boolean(accessToken) && loadedKey !== requestKey;
  const error = failure?.key === requestKey ? failure.message : null;

  if (error) {
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

  const trip = detail?.trip;
  const dispatchNumber = String(trip?.dispatch_number ?? "Trip details");
  const stops = detail?.stops ?? [];
  const reportRows = detail?.bookingRows ?? [];
  const orderedEvents = (detail?.events ?? []).slice().sort(
    (a, b) => Date.parse(a.event_time) - Date.parse(b.event_time),
  );
  const mapTrack: TripEventTrack[] = trip
    ? [{ trip, events: detail?.events ?? [] }]
    : [];
  const destinationNames = [...new Set(
    reportRows.map((row) => String(row.store_name ?? "")).filter(Boolean),
  )];
  const originName = getBookingValue(
    reportRows,
    "warehouse_name",
    getBookingValue(reportRows, "warehouse_code", "Origin not recorded"),
  );
  const destinationText = destinationNames.length
    ? destinationNames.join(", ")
    : "Store destinations not available";

  const stopKey = (stop: TripChildRecord, index: number) =>
    String(stop.stop_sequence ?? index + 1);
  const rowsForStop = (key: string) =>
    reportRows.filter((row) => String(row.stop_sequence ?? "") === key);
  const visibleRows = selectedStop ? rowsForStop(selectedStop) : reportRows;

  const doneStops = stops.filter(stopIsDone).length;
  const progress = stops.length ? Math.round((doneStops / stops.length) * 100) : 0;
  const cargoRows = reportRows.length > 0 ? reportRows : detail?.lineItems ?? [];
  const totalQty = sumOf(cargoRows, "quantity");
  const totalCbm = sumOf(cargoRows, "cbm");
  const lineItemCount = detail?.lineItems.length ?? reportRows.length;
  const driverName = getBookingValue(reportRows, "driver_name");
  const placeholder = isLoading ? "…" : undefined;
  const timelineEvents = orderedEvents.slice().reverse();

  return (
    <div className="space-y-4">
      {/* Top Bar: Back button + Status Pill */}
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-4 text-xs font-semibold text-[#0b2341] shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to trips
        </button>
        <StatusPill status={trip?.status} fallback="Loading" />
      </header>

      {/* Top Section: Gallery + Truck Visualization */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 items-start">
        {/* Photo Gallery */}
        <div className="min-w-0">
          <TripGallery
            key={tripId}
            plate={getBookingValue(reportRows, "plate_number", "No plate recorded")}
            tripId={tripId}
            accessToken={accessToken}
          />
        </div>

        {/* Truck Visualization */}
        <div className="min-w-0">
          <div className="rounded-3xl bg-white p-6 shadow-[0_4px_20px_-4px_rgba(11,35,65,0.08)]">
            <TruckVisualization
              cargoRows={cargoRows}
              selectedItem={selectedCargoItem}
              onSelectItem={setSelectedCargoItem}
              truckCapacityCbm={detail?.truckCapacityCbm ?? null}
              totalCbm={totalCbm}
            />
          </div>
        </div>
      </div>

      {/* Trip Summary & Stops */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trip Summary */}
        <div className={`${surface.card} p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={surface.eyebrow}>Dispatch number</p>
              <h2 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-[#0b2341]">
                {isLoading ? "Loading trip…" : dispatchNumber}
              </h2>
            </div>
            <StatusPill status={trip?.status} fallback="Loading" />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{placeholder ?? `${doneStops} of ${stops.length} stops completed`}</span>
              <span className="font-semibold text-[#0b2341]">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#ffd43b] transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Loading {shortDate(trip?.loading_date)}</span>
              <span>ETA {shortDate(trip?.estimated_delivery_date)}</span>
            </div>
          </div>

          <ul className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
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
                <span className="break-words text-slate-700">{destinationText}</span>
              </span>
            </li>
          </ul>

          <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
            {[
              ["Items", placeholder ?? String(lineItemCount)],
              ["Quantity", placeholder ?? formatNumber(totalQty)],
              ["CBM", placeholder ?? formatNumber(totalCbm)],
            ].map(([label, value]) => (
              <div key={label} className={`${surface.inner} px-2 py-3`}>
                <dd className="text-base font-bold tabular-nums text-[#0b2341]">{value}</dd>
                <dt className="text-[11px] text-slate-500">{label}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ffd43b] text-[#0b2341]">
              {driverName === "Not recorded" ? <UserRound aria-hidden="true" className="h-5 w-5" /> : <span className="text-sm font-bold">{driverName.charAt(0).toUpperCase()}</span>}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0b2341]">{driverName}</p>
              <p className="truncate text-[11px] text-slate-500">Driver · {getBookingValue(reportRows, "trucking_company")}</p>
            </div>
          </div>

          {Boolean(trip?.remarks) && (
            <p className={`${surface.inner} mt-5 px-4 py-3 text-xs text-slate-600`}>{String(trip?.remarks)}</p>
          )}
        </div>

        {/* Stops */}
        <div className={`${surface.card} p-6`}>
          <h3 className={surface.heading}>Stops</h3>
          {stops.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {placeholder ?? "No stops recorded for this trip."}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {stops.map((stop, index) => {
                const key = stopKey(stop, index);
                const match = rowsForStop(key)[0] ?? {};
                return (
                  <li key={String(stop.id ?? stop.trip_stop_id ?? `${tripId}-${index}`)} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[11px] font-bold text-[#0b2341]">
                      {key}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0b2341]">
                        {valueText(match.store_name, valueText(stop.store_id, "Store not recorded"))}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {valueText(match.customer_name, valueText(stop.customer_id, "Customer not recorded"))}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Clock aria-hidden="true" className="h-3 w-3" />
                        {stop.arrival_time ? dateText(stop.arrival_time, true) : "No arrival yet"}
                      </p>
                    </div>
                    <StatusPill status={stop.delivery_status ?? match.delivery_status} fallback="Pending" />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Fleet tracking: timeline beside the map */}
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className={`${surface.card} flex min-w-0 flex-col p-5`}>
          <header className="mb-3">
            <div className="flex items-center justify-between">
              <h3 className={surface.heading}>Trip tracking</h3>
              <span className="rounded-full bg-[#e6f0f9] px-3 py-1 text-[11px] font-semibold tabular-nums text-[#1d5f94]">
                {orderedEvents.length} events
              </span>
            </div>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#ffd43b]" />
                <span className="min-w-0 break-words">{originName}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2678b9]" />
                <span className="min-w-0 break-words">{destinationText}</span>
              </li>
            </ul>
          </header>
          {timelineEvents.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No events recorded.</p>
          ) : (
            <ol className="relative ml-2 max-h-[400px] flex-1 overflow-y-auto border-l-2 border-[#ffd43b]/70 pl-5 pr-1">
              {timelineEvents.map((event, index) => (
                <li key={event.id} className="relative mb-5 last:mb-0">
                  <span
                    className={`timeline-dot absolute -left-[28px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                      index === 0 ? "bg-[#ffd43b] text-[#ffd43b]" : "bg-[#2678b9] text-[#2678b9]"
                    }`}
                  />
                  <p className="text-sm font-semibold capitalize text-[#0b2341]">{event.event_type.replaceAll("_", " ").toLowerCase()}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">{dateText(event.event_time, true)}</p>
                  {event.notes && <p className="mt-1 text-xs text-slate-600">{event.notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="min-w-0">
          <LiveTripMap tracks={mapTrack} focusTripId={tripId} eventLoadError={false} height={420} />
        </div>
      </div>

      {/* Products table, Orders-style */}
      <section className={`${surface.card} min-w-0 overflow-hidden`}>
        <header className="flex flex-col gap-3 px-5 pb-3 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <h3 className={surface.heading}>Products</h3>
            <span className="rounded-full bg-[#0b2341] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white">{reportRows.length}</span>
          </div>
          <div role="group" aria-label="Filter products by stop" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[#eef3f8] p-1">
            {[{ key: null as string | null, label: "All" }, ...stops.map((stop, index) => ({ key: stopKey(stop, index), label: `Stop ${stopKey(stop, index)}` }))].map(({ key, label }) => {
              const count = key === null ? reportRows.length : rowsForStop(key).length;
              const active = selectedStop === key;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedStop(key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${active ? "bg-white text-[#0b2341] shadow-[0_2px_8px_-2px_rgba(11,35,65,0.2)]" : "text-slate-500 hover:text-[#0b2341]"}`}>
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
                    {selectedStop ? "No products recorded for this stop." : "No product rows available."}
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
                  <tr key={String(row.trip_line_item_id ?? row.id ?? `${tripId}-item-${index}`)} className="bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04)]">
                    <td
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewProduct(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setViewProduct(row);
                        }
                      }}
                      aria-label={`View appliance details for ${productName}`}
                      className="group/product cursor-pointer rounded-l-2xl px-4 py-3.5 font-semibold text-[#0b2341] transition-colors hover:bg-[#eaf3fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2678b9]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f2f6fa]">
                          <ProductPhotoThumb key={`${productId}:${photoUrl ?? "empty"}`} src={photoUrl} />
                          {productId && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPhotoProduct({ id: productId, name: productName });
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                              aria-label={`${photoUrl ? "Change" : "Upload"} photo for ${productName}`}
                              title={photoUrl ? "Change product photo" : "Upload product photo"}
                              className="invisible absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-[#0b2341]/65 text-[9px] font-semibold leading-none text-white opacity-0 transition hover:bg-[#0b2341]/75 focus-visible:visible focus-visible:opacity-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 [@media(hover:none)]:visible [@media(hover:none)]:opacity-100"
                            >
                              <ImagePlus aria-hidden="true" className="h-4 w-4" />
                              {photoUrl ? "Change" : "Upload"}
                            </button>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          {productName}
                        </span>
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
          {visibleRows.length} {visibleRows.length === 1 ? "line" : "lines"} · {formatNumber(sumOf(visibleRows, "quantity"))} units · {formatNumber(sumOf(visibleRows, "cbm"))} CBM
        </footer>
      </section>
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
          className="fixed inset-0 z-[1250] flex items-center justify-center bg-[#0b2341]/45 p-4"
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
                      <dd className="mt-0.5 truncate font-medium text-slate-700">
                        {valueText(value, "—")}
                      </dd>
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