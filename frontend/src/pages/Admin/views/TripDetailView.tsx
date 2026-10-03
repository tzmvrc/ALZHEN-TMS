import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Package,
  Store,
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
import { fleetTruckPhoto, surface } from "../../../components/admin/dashboardStyles";

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

/* Half-circle gauge, same visual idea as the engine-load dial in the reference */
function ProgressGauge({ percent }: { percent: number }) {
  const length = Math.PI * 50;
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * length;
  return (
    <svg viewBox="0 0 120 72" className="mx-auto w-full max-w-[190px]" role="img" aria-label={`${percent}% of stops completed`}>
      <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#e2e8f0" strokeWidth="11" strokeLinecap="round" />
      <path
        d="M10 62 A50 50 0 0 1 110 62"
        fill="none"
        stroke="#ffd43b"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${length}`}
      />
      <text x="60" y="58" textAnchor="middle" className="fill-[#0b2341] text-[22px] font-bold">
        {percent}%
      </text>
    </svg>
  );
}

const glass =
  "rounded-3xl bg-white/85 shadow-[0_1px_2px_rgba(11,35,65,0.04),0_10px_30px_-18px_rgba(11,35,65,0.18)] backdrop-blur";

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

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white pl-3 pr-4 text-xs font-semibold text-[#0b2341] shadow-[0_1px_2px_rgba(11,35,65,0.08)] transition hover:bg-[#ffd43b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40">
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

      {/* Hero */}
      <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-[#e6f0f9] via-[#f4f8fc] to-[#eef3f8] p-3 shadow-[0_1px_2px_rgba(11,35,65,0.04),0_10px_30px_-18px_rgba(11,35,65,0.14)] sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
          {/* Left: dispatch, stop progress, driver */}
          <div className="space-y-3">
            <div className={`${glass} p-5`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 truncate text-xl font-bold tracking-tight text-[#0b2341]">
                  {isLoading ? "Loading trip…" : dispatchNumber}
                </h2>
                <StatusPill status={trip?.status} fallback="Loading" />
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                <span>{placeholder ?? `${doneStops} of ${stops.length} stops`}</span>
                <span className="font-semibold text-[#0b2341]">{progress}%</span>
              </div>
              <div className="relative mt-2 h-1.5 rounded-full bg-slate-200/80">
                <div className="h-full rounded-full bg-[#0b2341] transition-all duration-500" style={{ width: `${progress}%` }} />
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#ffd43b] shadow"
                  style={{ left: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-slate-600">
                <span>{shortDate(trip?.loading_date)}</span>
                <span>{shortDate(trip?.estimated_delivery_date)}</span>
              </div>
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full border-2 border-[#0b2341] bg-white" />
                  <span className="min-w-0 break-words text-slate-700">{originName}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2678b9]" />
                  <span className="min-w-0 break-words text-slate-700">{destinationText}</span>
                </li>
              </ul>
            </div>

            <div className={`${glass} p-5`}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-[#0b2341]">Stop progress</h3>
                <span className="text-[11px] text-slate-400">{stops.length} stops</span>
              </div>
              {stops.length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">{placeholder ?? "No stops recorded."}</p>
              ) : (
                <div className="mt-4 flex h-12 items-end gap-1.5" aria-hidden="true">
                  {stops.map((stop, index) => {
                    const done = stopIsDone(stop);
                    const isNext = !done && stops.slice(0, index).every(stopIsDone);
                    return (
                      <span
                        key={stopKey(stop, index)}
                        className={`flex-1 rounded-full ${done ? "bg-[#0b2341]" : isNext ? "bg-[#ffd43b]" : "bg-slate-200"}`}
                        style={{ height: `${40 + ((index * 17) % 60)}%` }}
                      />
                    );
                  })}
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-500">
                <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#0b2341]" />Done</span>
                <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#ffd43b]" />Next</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200" />Pending</span>
              </p>
            </div>

            <div className={`${glass} flex items-center gap-3 p-4`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ffd43b] text-[#0b2341]">
                {driverName === "Not recorded" ? <UserRound aria-hidden="true" className="h-5 w-5" /> : <span className="text-sm font-bold">{driverName.charAt(0).toUpperCase()}</span>}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0b2341]">{driverName}</p>
                <p className="text-[11px] text-slate-500">Driver · {getBookingValue(reportRows, "trucking_company")}</p>
              </div>
            </div>
          </div>

          {/* Center: truck */}
          <div className="relative order-first flex min-h-[260px] flex-col items-center justify-center xl:order-none">
            <img
              src={fleetTruckPhoto}
              alt=""
              className="w-full max-w-[640px] object-contain mix-blend-multiply drop-shadow-[0_24px_24px_rgba(11,35,65,0.18)]"
            />
            <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#0b2341] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_8px_20px_-8px_rgba(11,35,65,0.6)]">
              <Truck aria-hidden="true" className="h-3.5 w-3.5 text-[#ffd43b]" />
              {getBookingValue(reportRows, "plate_number", "No plate recorded")}
            </span>
          </div>

          {/* Right: key figures */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
            <div className="rounded-3xl bg-emerald-50/90 p-5 shadow-[0_10px_30px_-18px_rgba(11,35,65,0.18)]">
              <Store aria-hidden="true" className="h-6 w-6 text-emerald-600" />
              <p className="mt-3 text-2xl font-bold text-[#0b2341]">
                {placeholder ?? `${doneStops}/${stops.length}`}
              </p>
              <p className="text-[11px] text-slate-500">Stops completed</p>
            </div>
            <div className={`${glass} col-span-2 p-5 xl:col-span-1`}>
              <h3 className="text-sm font-semibold text-[#0b2341]">Delivery progress</h3>
              <p className="text-[11px] text-slate-500">Share of stops completed</p>
              <div className="mt-2"><ProgressGauge percent={progress} /></div>
            </div>
            <div className={`${glass} col-span-2 p-5 xl:col-span-1`}>
              <h3 className="text-sm font-semibold text-[#0b2341]">Cargo</h3>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Items", placeholder ?? String(lineItemCount)],
                  ["Quantity", placeholder ?? formatNumber(totalQty)],
                  ["CBM", placeholder ?? formatNumber(totalCbm)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-[#f2f6fa] px-1 py-2.5">
                    <dd className="text-base font-bold tabular-nums text-[#0b2341]">{value}</dd>
                    <dt className="text-[10px] text-slate-500">{label}</dt>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-[#2678b9]" />
                ETA {dateText(trip?.estimated_delivery_date)}
              </p>
            </div>
          </div>
        </div>
        {Boolean(trip?.remarks) && (
          <p className="mt-3 rounded-2xl bg-white/70 px-4 py-2.5 text-xs text-slate-600">{String(trip?.remarks)}</p>
        )}
      </section>

      {/* Stop selector strip */}
      <section aria-label="Stops" className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
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
                className={`min-w-[230px] max-w-[260px] shrink-0 rounded-3xl bg-white p-4 text-left shadow-[0_1px_2px_rgba(11,35,65,0.04),0_10px_30px_-18px_rgba(11,35,65,0.14)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 ${
                  selected ? "ring-2 ring-[#ffd43b]" : "hover:bg-[#f9fbfd]"
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${selected ? "bg-[#ffd43b] text-[#0b2341]" : "bg-[#e6f0f9] text-[#0b2341]"}`}>
                    {key}
                  </span>
                  <StatusPill status={stop.delivery_status ?? match.delivery_status} fallback="Pending" />
                </div>
                <p className="mt-3 truncate text-sm font-semibold text-[#0b2341]">
                  {valueText(match.store_name, valueText(stop.store_id, "Store not recorded"))}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {valueText(match.customer_name, valueText(stop.customer_id, "Customer not recorded"))}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Clock aria-hidden="true" className="h-3 w-3" />
                  {stop.arrival_time ? dateText(stop.arrival_time, true) : "No arrival yet"}
                </p>
              </button>
            );
          })
        )}
      </section>

      {/* Map + timeline | products */}
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.5fr)]">
        <div className="min-w-0 space-y-4">
          <LiveTripMap tracks={mapTrack} focusTripId={tripId} eventLoadError={false} height={300} />

          <section className={`${surface.card} p-5`}>
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h3 className={surface.heading}>Activity</h3>
                <p className="text-[10px] text-slate-500">Recorded trip and GPS updates</p>
              </div>
              <span className="rounded-full bg-[#e6f0f9] px-3 py-1 text-[11px] font-semibold tabular-nums text-[#1d5f94]">
                {orderedEvents.length} events
              </span>
            </header>
            {orderedEvents.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No events recorded.</p>
            ) : (
              <ol className="relative ml-2 max-h-80 overflow-y-auto border-l border-slate-200 pl-5 pr-1">
                {orderedEvents.map((event, index) => (
                  <li key={event.id} className="relative mb-5 last:mb-0">
                    <span
                      className={`timeline-dot absolute -left-[27px] top-1 h-3 w-3 rounded-full ${
                        index === orderedEvents.length - 1 ? "bg-[#ffd43b] text-[#ffd43b]" : "bg-[#2678b9] text-[#2678b9]"
                      }`}
                    />
                    <p className="text-[11px] font-medium text-slate-400">{dateText(event.event_time, true)}</p>
                    <p className="mt-0.5 text-sm font-semibold capitalize text-[#0b2341]">{event.event_type.replaceAll("_", " ").toLowerCase()}</p>
                    {event.notes && <p className="mt-1 text-xs text-slate-600">{event.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className={`${surface.card} min-w-0 overflow-hidden`}>
          <header className="flex flex-col gap-3 px-5 pb-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className={surface.heading}>Products and line items</h3>
              <p className="text-[10px] text-slate-500">From the trip booking rows</p>
            </div>
            <div role="group" aria-label="Filter products by stop" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[#f2f6fa] p-1">
              {[{ key: null as string | null, label: "All" }, ...stops.map((stop, index) => ({ key: stopKey(stop, index), label: `Stop ${stopKey(stop, index)}` }))].map(({ key, label }) => {
                const count = key === null ? reportRows.length : rowsForStop(key).length;
                const active = selectedStop === key;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedStop(key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${active ? "bg-[#0b2341] text-white shadow-sm" : "text-slate-500 hover:text-[#0b2341]"}`}>
                    {label} <span className={active ? "text-white/60" : "text-slate-400"}>{count}</span>
                  </button>
                );
              })}
            </div>
          </header>
          <div className="overflow-x-auto bg-[#f2f6fa] px-3 pb-3">
            <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-left text-xs">
              <thead className="text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="px-4 pb-1 pt-3">Product</th>
                  <th className="px-4 pb-1 pt-3">SKU / Model</th>
                  <th className="px-4 pb-1 pt-3 text-right">Quantity</th>
                  <th className="px-4 pb-1 pt-3 text-right">CBM</th>
                  <th className="px-4 pb-1 pt-3">DR number</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500">
                      {selectedStop ? "No products recorded for this stop." : "No product rows available."}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, index) => (
                    <tr key={String(row.trip_line_item_id ?? row.id ?? `${tripId}-item-${index}`)} className="bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04)]">
                      <td className="rounded-l-2xl px-4 py-3 font-semibold text-[#0b2341]">{valueText(row.product_name, "Product not recorded")}</td>
                      <td className="px-4 py-3 text-slate-600">{valueText(row.sku ?? row.model_code)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{valueText(row.quantity)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{valueText(row.cbm)}</td>
                      <td className="rounded-r-2xl px-4 py-3 text-slate-700">{valueText(row.dr_number)}</td>
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
    </div>
  );
}