import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Package,
  Truck,
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

function getBookingValue(
  bookingRows: Record<string, unknown>[],
  key: string,
  fallback = "Not recorded",
): string {
  const value = bookingRows.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
  return valueText(value, fallback);
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
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p role="alert" className="text-sm text-rose-700">{error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="min-h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-700">Back to trips</button>
          <button type="button" onClick={() => setRetry((current) => current + 1)} className="min-h-9 rounded-md bg-slate-900 px-3 text-sm font-medium text-white">Retry</button>
        </div>
      </div>
    );
  }

  const trip = detail?.trip;
  const dispatchNumber = String(trip?.dispatch_number ?? "Trip details");
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
  const firstBooking = reportRows[0] ?? {};

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            aria-label="Back to trips"
            onClick={onBack}
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase text-cyan-800">Trip details</p>
            <h2 className="truncate text-xl font-semibold text-slate-900">
              {isLoading ? "Loading trip..." : dispatchNumber}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {valueText(firstBooking.warehouse_name, "Origin not recorded")}
              {destinationNames.length > 0 ? ` to ${destinationNames.join(", ")}` : " · Destination details unavailable"}
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
          {valueText(trip?.status, "Loading status...").replaceAll("_", " ")}
        </span>
      </header>

      {detail?.bookingError && (
        <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Some customer, store, truck, or product labels could not be loaded: {detail.bookingError}
        </p>
      )}
      {(detail?.sectionErrors.length ?? 0) > 0 && (
        <div role="status" className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Some trip sections are temporarily unavailable: {detail?.sectionErrors.join("; ")}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Loading date", value: dateText(trip?.loading_date), icon: CalendarDays },
          { label: "Estimated delivery", value: dateText(trip?.estimated_delivery_date), icon: MapPin },
          { label: "Stops", value: String(detail?.stops.length ?? 0), icon: MapPin },
          { label: "Line items", value: String(detail?.lineItems.length ?? reportRows.length), icon: Package },
        ].map(({ label, value, icon: Icon }) => (
          <section key={label} className="flex min-h-24 items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{isLoading ? "..." : value}</p>
            </div>
            <Icon aria-hidden="true" className="h-4 w-4 text-cyan-800" />
          </section>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.9fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <header className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Truck and driver</h3>
            <p className="mt-0.5 text-xs text-slate-500">Assignment from the trip booking data</p>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-50 text-cyan-800"><Truck aria-hidden="true" className="h-4 w-4" /></span>
              <div>
                <p className="text-[10px] font-semibold uppercase text-slate-500">Truck</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{getBookingValue(reportRows, "plate_number")}</p>
                <p className="mt-0.5 text-xs text-slate-500">{getBookingValue(reportRows, "trucking_company")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-800"><Package aria-hidden="true" className="h-4 w-4" /></span>
              <div>
                <p className="text-[10px] font-semibold uppercase text-slate-500">Driver</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{getBookingValue(reportRows, "driver_name")}</p>
                <p className="mt-0.5 text-xs text-slate-500">Warehouse {getBookingValue(reportRows, "warehouse_code")}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Route</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md bg-slate-100 px-2.5 py-1.5 font-medium text-slate-800">
                {getBookingValue(reportRows, "warehouse_name", getBookingValue(reportRows, "warehouse_code", "Origin not recorded"))}
              </span>
              <span aria-hidden="true" className="text-slate-400">→</span>
              <span className="min-w-0 text-slate-700">
                {destinationNames.length ? destinationNames.join(" · ") : "Store destinations not available"}
              </span>
            </div>
          </div>
          {Boolean(trip?.remarks) && (
            <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">{String(trip?.remarks)}</p>
          )}
        </section>

        <LiveTripMap tracks={mapTrack} focusTripId={tripId} eventLoadError={false} height={340} />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Stops and stores</h3>
          <p className="mt-0.5 text-xs text-slate-500">Store details and delivery timing</p>
        </header>
        {(detail?.stops ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No stops recorded for this trip.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {(detail?.stops ?? []).map((stop, index) => {
              const sequence = stop.stop_sequence;
              const matchingRows = reportRows.filter((row) =>
                String(row.stop_sequence ?? "") === String(sequence ?? index + 1),
              );
              const firstMatch = matchingRows[0] ?? {};
              return (
                <li key={String(stop.id ?? stop.trip_stop_id ?? `${tripId}-${index}`)} className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,0.7fr))]">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-900">{String(sequence ?? index + 1)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{valueText(firstMatch.store_name, valueText(stop.store_id, "Store not recorded"))}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{valueText(firstMatch.customer_name, valueText(stop.customer_id, "Customer not recorded"))}</p>
                      <p className="mt-1 text-xs text-slate-600">{valueText(firstMatch.city ?? firstMatch.province, "Location not recorded")}</p>
                    </div>
                  </div>
                  <DetailField label="Delivery status" value={valueText(stop.delivery_status ?? firstMatch.delivery_status)} />
                  <DetailField label="Arrival" value={dateText(stop.arrival_time, true)} />
                  <DetailField label="Departure" value={dateText(stop.departure_time, true)} />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Products and line items</h3>
          <p className="mt-0.5 text-xs text-slate-500">Product details from trip booking rows</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50 font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU / Model</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">CBM</th>
                <th className="px-4 py-3">DR number</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No product rows available.</td></tr>
              ) : reportRows.map((row, index) => (
                <tr key={String(row.trip_line_item_id ?? row.id ?? `${tripId}-item-${index}`)} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{valueText(row.product_name, "Product not recorded")}</td>
                  <td className="px-4 py-3 text-slate-600">{valueText(row.sku ?? row.model_code)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{valueText(row.quantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{valueText(row.cbm)}</td>
                  <td className="px-4 py-3 text-slate-700">{valueText(row.dr_number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Trip event timeline</h3>
            <p className="mt-0.5 text-xs text-slate-500">Recorded trip and GPS updates</p>
          </div>
          <span className="text-xs tabular-nums text-slate-500">{orderedEvents.length} events</span>
        </header>
        {orderedEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No events recorded.</p>
        ) : (
          <ol className="relative ml-2 border-l border-slate-200 pl-5">
            {orderedEvents.map((event) => (
              <li key={event.id} className="relative mb-5 last:mb-0">
                <span className="timeline-dot absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-cyan-700 text-cyan-700" />
                <p className="text-[11px] font-semibold text-slate-500">{dateText(event.event_time, true)}</p>
                <p className="mt-0.5 text-sm font-medium capitalize text-slate-800">{event.event_type.replaceAll("_", " ")}</p>
                {event.notes && <p className="mt-1 text-xs text-slate-600">{event.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs text-slate-800">{value}</p>
    </div>
  );
}