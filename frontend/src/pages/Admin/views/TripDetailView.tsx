import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Package,
  Truck,
  UserRound,
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
import { fleetTruckPhotos, getFleetTruckPhoto, surface } from "../../../components/admin/dashboardStyles";
import ImageWithFallback from "../../../components/admin/ImageWithFallback";
import {
  getProductPhotoFallback,
  getRecordImageUrls,
  PRODUCT_IMAGE_FIELDS,
  TRIP_IMAGE_FIELDS,
} from "../../../services/image.service";

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
  sectionErrors: string[];
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
  trip,
  seed,
  plate,
}: {
  trip: TripRecord;
  seed: string;
  plate: string;
}) {
  const photos = useMemo(() => {
    const backendPhotos = getRecordImageUrls(trip, TRIP_IMAGE_FIELDS);
    if (backendPhotos.length > 0) return backendPhotos;

    const first = getFleetTruckPhoto(seed);
    const start = Math.max((fleetTruckPhotos as readonly string[]).indexOf(first), 0);
    return [...fleetTruckPhotos.slice(start), ...fleetTruckPhotos.slice(0, start)];
  }, [seed, trip]);
  const [active, setActive] = useState(0);
  const go = (step: number) => setActive((current) => (current + step + photos.length) % photos.length);
  const navBtn =
    "absolute top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0b2341] shadow-[0_2px_8px_rgba(11,35,65,0.18)] transition hover:bg-[#ffd43b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40";

  return (
    <div className={`${surface.card} p-3`}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100">
        <ImageWithFallback
          key={photos[active]}
          src={photos[active]}
          fallbackSrc={getFleetTruckPhoto(seed)}
          alt={`Truck photo ${active + 1} of ${photos.length}`}
          className="h-full w-full object-cover"
        />
        <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className={`${navBtn} left-3`}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Next photo" onClick={() => go(1)} className={`${navBtn} right-3`}>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-[#0b2341]/90 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          <Truck aria-hidden="true" className="h-3.5 w-3.5 text-[#ffd43b]" />
          {plate}
        </span>
        <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#0b2341]">
          {active + 1} / {photos.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Truck photos">
        {photos.map((photo, index) => (
          <button
            key={photo}
            type="button"
            aria-label={`Show photo ${index + 1}`}
            aria-pressed={index === active}
            onClick={() => setActive(index)}
            className={`aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 ${
              index === active ? "ring-2 ring-[#ffd43b] ring-offset-2" : "opacity-60 hover:opacity-100"
            }`}>
            <ImageWithFallback
              src={photo}
              fallbackSrc={getFleetTruckPhoto(seed)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
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
        if (!active) return;
        setDetail({
          trip: tripResponse.trip,
          stops,
          lineItems,
          events,
          bookingRows,
          bookingError,
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
  const totalQty = sumOf(reportRows, "quantity");
  const totalCbm = sumOf(reportRows, "cbm");
  const lineItemCount = detail?.lineItems.length ?? reportRows.length;
  const driverName = getBookingValue(reportRows, "driver_name");
  const placeholder = isLoading ? "…" : undefined;

  const timelineEvents = orderedEvents.slice().reverse();

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/70 bg-white/80 pl-3 pr-4 text-xs font-semibold text-[#0b2341] shadow-[0_1px_2px_rgba(11,35,65,0.08)] backdrop-blur transition hover:bg-[#ffd43b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to trips
        </button>
        <p className="truncate text-xs text-slate-500">
          {placeholder ?? `${valueText(trip?.status, "Status not recorded").replaceAll("_", " ")} · loading ${shortDate(trip?.loading_date)}`}
        </p>
      </header>

      {detail?.bookingError && (
        <p className="rounded-2xl border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Some customer, store, truck, or product labels could not be loaded: {detail.bookingError}
        </p>
      )}
      {(detail?.sectionErrors.length ?? 0) > 0 && (
        <div role="status" className="rounded-2xl border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Some trip sections are temporarily unavailable: {detail?.sectionErrors.join("; ")}
        </div>
      )}

      {/* Overview: gallery on the left, trip summary on the right. Nothing overlaps. */}
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TripGallery
          key={tripId}
          trip={trip ?? {}}
          seed={tripId}
          plate={getBookingValue(reportRows, "plate_number", "No plate recorded")}
        />

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
      </section>

      {/* Stop selector strip */}
      <section aria-label="Stops" className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-1">
        {stops.length === 0 ? (
          <p className={`${surface.card} w-full px-5 py-6 text-center text-sm text-slate-500`}>
            {placeholder ?? "No stops recorded for this trip."}
          </p>
        ) : (
          stops.map((stop, index) => {
            const key = stopKey(stop, index);
            const match = rowsForStop(key)[0] ?? {};
            const selected = selectedStop === key;
            return (
              <button
                key={String(stop.id ?? stop.trip_stop_id ?? `${tripId}-${index}`)}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedStop((current) => (current === key ? null : key))}
                className={`relative min-w-[250px] max-w-[280px] shrink-0 overflow-hidden rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 ${
                  selected
                    ? "border-transparent bg-white shadow-[0_12px_28px_-14px_rgba(11,35,65,0.3)] ring-2 ring-[#ffd43b]"
                    : "border-slate-200/70 bg-white hover:border-slate-300"
                }`}>
                <div className="relative flex items-center gap-2">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${selected ? "bg-[#ffd43b] text-[#0b2341]" : "bg-[#e6f0f9] text-[#0b2341]"}`}>
                    {key}
                  </span>
                  <StatusPill status={stop.delivery_status ?? match.delivery_status} fallback="Pending" />
                </div>
                <p className="relative mt-3 truncate text-sm font-bold text-[#0b2341]">
                  {valueText(match.store_name, valueText(stop.store_id, "Store not recorded"))}
                </p>
                <p className="relative mt-0.5 truncate text-[11px] text-slate-500">
                  {valueText(match.customer_name, valueText(stop.customer_id, "Customer not recorded"))}
                </p>
                <p className="relative mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Clock aria-hidden="true" className="h-3 w-3" />
                  {stop.arrival_time ? dateText(stop.arrival_time, true) : "No arrival yet"}
                </p>
              </button>
            );
          })
        )}
      </section>

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
                visibleRows.map((row, index) => (
                  <tr key={String(row.trip_line_item_id ?? row.id ?? `${tripId}-item-${index}`)} className="bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04)]">
                    <td className="rounded-l-2xl px-4 py-3.5 font-semibold text-[#0b2341]">
                      <div className="flex min-w-0 items-center gap-3">
                        <ImageWithFallback
                          src={getRecordImageUrls(row, PRODUCT_IMAGE_FIELDS)[0]}
                          fallbackSrc={getProductPhotoFallback(row)}
                          alt={`Reference photo for ${valueText(row.product_name, "appliance")}`}
                          loading="lazy"
                          className="h-14 w-14 shrink-0 rounded-xl bg-[#f2f6fa] object-cover"
                        />
                        <span className="min-w-0">{valueText(row.product_name, "Product not recorded")}</span>
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
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center gap-2 px-5 py-3 text-[11px] text-slate-500">
          <Package aria-hidden="true" className="h-3.5 w-3.5 text-[#2678b9]" />
          {visibleRows.length} {visibleRows.length === 1 ? "line" : "lines"} · {formatNumber(sumOf(visibleRows, "quantity"))} units · {formatNumber(sumOf(visibleRows, "cbm"))} CBM
        </footer>
      </section>
    </div>
  );
}