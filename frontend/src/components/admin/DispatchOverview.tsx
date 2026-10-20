import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  MapPin,
  Truck,
  User,
} from "lucide-react";
import {
  fetchTripAssignments,
  fetchTrips,
  type TripAssignmentRecord,
  type TripRecord,
} from "../../services/trip.service";
import { searchRelationshipOptions, type RelationshipOption } from "../../services/lookup.service";
import { useAuth } from "../../context/AuthContext";

type DispatchGroup = {
  reference: string;
  trips: TripRecord[];
  loadingDate: string | null;
  warehouseName: string | null;
};

type Tone = {
  /** Small status pill on light backgrounds */
  pill: string;
  /** Solid dot */
  dot: string;
  /** Saturated gradient used for the dispatch card header */
  header: string;
  /** Left accent stripe on trip rows */
  stripe: string;
  /** Soft tinted background for trip rows */
  soft: string;
};

const COMPLETE_PATTERN = /DELIVER|COMPLETE|FINISH/i;
const MOVING_PATTERN = /TRANSIT|LOAD|PROGRESS/i;

function statusTone(status: unknown): Tone {
  const value = String(status ?? "").toUpperCase();
  if (/DELIVER|COMPLETE|FINISH/.test(value)) {
    return {
      pill: "bg-emerald-100 text-emerald-800 ring-emerald-600/25",
      dot: "bg-emerald-500",
      header: "from-emerald-700 via-emerald-600 to-teal-500",
      stripe: "border-l-emerald-500",
      soft: "bg-emerald-50/70",
    };
  }
  if (/CANCEL|FAIL/.test(value)) {
    return {
      pill: "bg-rose-100 text-rose-800 ring-rose-600/25",
      dot: "bg-rose-500",
      header: "from-rose-700 via-rose-600 to-pink-500",
      stripe: "border-l-rose-500",
      soft: "bg-rose-50/70",
    };
  }
  if (/DELAY/.test(value)) {
    return {
      pill: "bg-amber-100 text-amber-800 ring-amber-600/30",
      dot: "bg-amber-500",
      header: "from-orange-600 via-orange-500 to-amber-400",
      stripe: "border-l-amber-500",
      soft: "bg-amber-50/70",
    };
  }
  if (/TRANSIT|LOAD|PROGRESS/.test(value)) {
    return {
      pill: "bg-sky-100 text-sky-800 ring-sky-600/25",
      dot: "bg-[#2678b9]",
      header: "from-[#0b2341] via-[#134a7c] to-[#2678b9]",
      stripe: "border-l-[#2678b9]",
      soft: "bg-sky-50/70",
    };
  }
  return {
    pill: "bg-indigo-100 text-indigo-800 ring-indigo-600/25",
    dot: "bg-indigo-500",
    header: "from-indigo-800 via-indigo-600 to-violet-500",
    stripe: "border-l-indigo-400",
    soft: "bg-indigo-50/60",
  };
}

function display(value: unknown, fallback = "Not recorded") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function recordValue(record: TripRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value);
    }
  }
  return "";
}

function dateLabel(value: unknown) {
  if (typeof value !== "string" || !value) return "Date not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function SectionMessage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sky-200 bg-gradient-to-b from-sky-50/80 to-white px-5 py-14 text-center">
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ffd43b] text-[#0b2341] shadow-sm">
        <Truck className="h-5 w-5" />
      </span>
      <p className="max-w-xl text-sm text-slate-600">{children}</p>
      {action}
    </div>
  );
}

type StatItem = { label: string; value: ReactNode; box: string; label_tone: string; value_tone: string };

function StatTiles({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className={`min-w-0 rounded-xl px-3 py-2.5 ${item.box}`}>
          <dt className={`text-[10px] font-medium ${item.label_tone}`}>{item.label}</dt>
          <dd className={`mt-0.5 truncate text-sm font-bold tabular-nums ${item.value_tone}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CardSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(11,35,65,0.06),0_12px_28px_-16px_rgba(11,35,65,0.3)] ring-1 ring-slate-200/70">
      <div className="h-40 bg-gradient-to-br from-[#c9dff2] to-[#e3eef8]" />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="h-12 rounded-xl bg-slate-100" />
          <div className="h-12 rounded-xl bg-emerald-50" />
          <div className="h-12 rounded-xl bg-sky-50" />
        </div>
        <div className="h-24 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

export default function DispatchOverview({
  onOpenTrip,
  refreshKey = 0,
}: {
  onOpenTrip: (tripId: string) => void;
  refreshKey?: number;
}) {
  const { accessToken } = useAuth();
  const page = 1;
  const [refresh, setRefresh] = useState(0);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<RelationshipOption[]>([]);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [assignmentRows, setAssignmentRows] = useState<Record<string, TripAssignmentRecord[]>>({});
  const [assignmentLoading, setAssignmentLoading] = useState<Record<string, boolean>>({});
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});
  const requestKey = `${page}:${refresh}:${refreshKey}`;
  const [requestStatus, setRequestStatus] = useState<{ key: string; error: string | null }>({ key: "", error: null });
  const loading = requestStatus.key !== requestKey;
  const error = requestStatus.key === requestKey ? requestStatus.error : null;

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void searchRelationshipOptions(accessToken, "warehouses", "").then((warehouses) => {
      if (active) {
        setWarehouseOptions(warehouses);
        setWarehouseError(null);
      }
    }).catch((cause: unknown) => {
      if (active) setWarehouseError(cause instanceof Error ? cause.message : "Unable to load warehouse names.");
    });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetchTrips(accessToken, {
        page,
        limit: 100,
        archiveScope: "active",
        sortBy: "loading_date",
        sortOrder: "desc",
      }).then((tripPage) => {
      if (!active) return;
      setTrips(tripPage.rows);
      setRequestStatus({ key: requestKey, error: null });
    }).catch((cause: unknown) => {
      if (!active) return;
      setRequestStatus({
        key: requestKey,
        error: cause instanceof Error ? cause.message : "Unable to load dispatches.",
      });
    });
    return () => { active = false; };
  }, [accessToken, page, refresh, refreshKey, requestKey]);

  const groups = useMemo(() => {
    const grouped = new Map<string, DispatchGroup>();
    for (const trip of trips) {
      const reference = typeof trip.dispatch_number === "string" ? trip.dispatch_number : "";
      if (!reference) continue;
      const group = grouped.get(reference) ?? {
        reference,
        trips: [],
        loadingDate: typeof trip.loading_date === "string" ? trip.loading_date : null,
        warehouseName: warehouseOptions.find((warehouse) => warehouse.id === trip.warehouse_id)?.label ?? null,
      };
      group.trips.push(trip);
      grouped.set(reference, group);
    }
    return [...grouped.values()];
  }, [trips, warehouseOptions]);

  async function loadAssignments(tripId: string) {
    if (!accessToken || assignmentLoading[tripId]) return;
    setAssignmentLoading((current) => ({ ...current, [tripId]: true }));
    setAssignmentErrors((current) => ({ ...current, [tripId]: "" }));
    try {
      const assignments = await fetchTripAssignments(accessToken, tripId);
      setAssignmentRows((current) => ({ ...current, [tripId]: assignments }));
    } catch (cause) {
      setAssignmentErrors((current) => ({
        ...current,
        [tripId]: cause instanceof Error ? cause.message : "Unable to load truck assignments.",
      }));
    } finally {
      setAssignmentLoading((current) => ({ ...current, [tripId]: false }));
    }
  }

  function toggleTrip(tripId: string) {
    if (expandedTrip === tripId) {
      setExpandedTrip(null);
      return;
    }
    setExpandedTrip(tripId);
    if (!assignmentRows[tripId]) void loadAssignments(tripId);
  }
  return (
    <div className="w-full min-w-0">
      {warehouseError && (
        <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Warehouse names are unavailable: {warehouseError}
        </p>
      )}

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3" aria-label="Loading dispatches" aria-busy="true">
          {[0, 1, 2].map((item) => <CardSkeleton key={item} />)}
        </div>
      ) : error ? (
        <SectionMessage action={<button type="button" onClick={() => setRefresh((current) => current + 1)} className="rounded-full bg-[#0b2341] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#134a7c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] focus-visible:ring-offset-2">Retry</button>}>
          {error}
        </SectionMessage>
      ) : groups.length === 0 ? (
        <SectionMessage>
          No dispatches are available.
        </SectionMessage>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {groups.map((group) => {
            const total = group.trips.length;
            const completeCount = group.trips.filter((trip) => COMPLETE_PATTERN.test(String(trip.status ?? ""))).length;
            const movingCount = group.trips.filter((trip) => {
              const value = String(trip.status ?? "");
              return MOVING_PATTERN.test(value) && !COMPLETE_PATTERN.test(value);
            }).length;
            const status = group.trips.find((trip) => trip.status)?.status ?? "PLANNED";
            const tone = statusTone(status);
            const progress = total ? (completeCount / total) * 100 : 0;
            const truckPosition = Math.min(Math.max(progress, 7), 93);
            return (
              <article
                key={group.reference}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(11,35,65,0.06),0_12px_28px_-16px_rgba(11,35,65,0.3)] ring-1 ring-slate-200/70"
              >
                <div className={`relative overflow-hidden bg-gradient-to-br ${tone.header} px-4 pb-4 pt-4 text-white`}>
                  <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
                  <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 right-10 h-28 w-28 rounded-full bg-white/5" />

                  <div className="relative flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`} />
                      {display(status, "PLANNED").replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/25">
                      {total} {total === 1 ? "trip" : "trips"}
                    </span>
                  </div>

                  <div className="relative mt-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-bold tracking-tight" title={group.reference}>{group.reference}</h3>
                      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-white/80">
                        <Building2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate" title={group.warehouseName ?? ""}>{group.warehouseName ?? "Warehouse not set"}</span>
                      </p>
                    </div>
                    <div className="shrink-0 rounded-xl bg-white/15 px-3 py-1.5 text-right ring-1 ring-white/25 backdrop-blur-sm">
                      <p className="text-[10px] text-white/75">Loading date</p>
                      <p className="whitespace-nowrap text-sm font-bold">{dateLabel(group.loadingDate)}</p>
                    </div>
                  </div>

                  <div
                    role="img"
                    aria-label={`${completeCount} of ${total} trips completed`}
                    className="relative mx-2 mt-5 h-9"
                  >
                    <span aria-hidden="true" className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white/35" />
                    <span aria-hidden="true" className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#ffd43b]" style={{ width: `${progress}%` }} />
                    <span aria-hidden="true" className="absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#ffd43b] ring-2 ring-white/40" />
                    <span aria-hidden="true" className="absolute right-0 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/70 bg-transparent">
                      <MapPin className="h-2.5 w-2.5 text-white" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#ffd43b] text-[#0b2341] shadow-lg ring-4 ring-white/25"
                      style={{ left: `${truckPosition}%` }}
                    >
                      <Truck className="h-4 w-4" />
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 p-3.5">
                  <StatTiles
                    items={[
                      { label: "Trips", value: total, box: "bg-slate-100", label_tone: "text-slate-500", value_tone: "text-[#0b2341]" },
                      { label: "Completed", value: `${completeCount}/${total}`, box: "bg-emerald-50 ring-1 ring-emerald-200/70", label_tone: "text-emerald-700/80", value_tone: "text-emerald-700" },
                      { label: "In transit", value: movingCount, box: "bg-sky-50 ring-1 ring-sky-200/70", label_tone: "text-sky-700/80", value_tone: "text-[#1d5f94]" },
                    ]}
                  />

                  <ul className="grid gap-2.5">
                    {group.trips.map((trip, index) => {
                      const tripId = String(trip.id ?? "");
                      const tripExpanded = expandedTrip === tripId;
                      const assignments = assignmentRows[tripId] ?? [];
                      const tripLabel = recordValue(trip, "trip_number") || String(index + 1);
                      const destination = recordValue(trip, "destination", "delivery_address", "ship_to", "customer_name", "store_name");
                      const tripWarehouse = warehouseOptions.find((warehouse) => warehouse.id === trip.warehouse_id)?.label ?? group.warehouseName ?? "Warehouse not set";
                      const activeAssignments = assignments.filter((assignment) => !assignment.unassigned_at);
                      const firstTruck = activeAssignments[0]?.truck ?? {};
                      const firstDriver = activeAssignments[0]?.driver ?? {};
                      const driverName = [firstDriver.first_name, firstDriver.last_name].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).join(" ");
                      const tripStatus = trip.status ?? "PLANNED";
                      const tripTone = statusTone(tripStatus);
                      const tripDate = typeof trip.loading_date === "string" ? trip.loading_date : null;
                      const showTripDate = Boolean(tripDate) && tripDate !== group.loadingDate;
                      const assignmentsLoaded = Boolean(assignmentRows[tripId]);
                      const panelId = `trip-assignments-${tripId || `${group.reference}-${index}`}`;
                      const hasActive = assignmentsLoaded && activeAssignments.length > 0;
                      return (
                        <li
                          key={tripId || `${group.reference}-${index}`}
                          className={`overflow-hidden rounded-xl border-l-4 ${tripTone.stripe} ${tripTone.soft} ring-1 ring-slate-200/70`}
                        >
                          <div className="px-3 pt-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <h4 className="truncate text-sm font-bold tracking-tight text-[#0b2341]">Trip {tripLabel}</h4>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${tripTone.pill}`}>
                                  {display(tripStatus, "PLANNED").replaceAll("_", " ")}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => onOpenTrip(tripId)}
                                title={`View Trip ${tripLabel}`}
                                aria-label={`View Trip ${tripLabel}`}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-white shadow-sm transition hover:bg-[#ffd43b] hover:text-[#0b2341] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 focus-visible:ring-offset-2"
                              >
                                <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <p className="mt-2 flex min-w-0 items-center gap-2 text-xs">
                              <span className="min-w-0 max-w-[45%] truncate text-slate-600" title={tripWarehouse}>{tripWarehouse}</span>
                              <ArrowRight aria-hidden="true" className="h-3 w-3 shrink-0 text-[#2678b9]" />
                              <span className={`min-w-0 flex-1 truncate font-semibold ${destination ? "text-[#0b2341]" : "text-slate-400"}`} title={destination}>
                                {destination || "Destination not recorded"}
                              </span>
                            </p>

                            {showTripDate && (
                              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-[#2678b9]" />
                                {dateLabel(tripDate)}
                              </p>
                            )}

                            <div className="mt-2.5">
                              <StatTiles
                                items={[
                                  { label: "Truck", value: hasActive ? display(firstTruck.plate_number, "Assigned") : "—", box: "bg-white ring-1 ring-sky-200/80", label_tone: "text-slate-500", value_tone: "text-[#2678b9]" },
                                  { label: "Driver", value: hasActive ? (driverName || "Not assigned") : "—", box: "bg-white ring-1 ring-sky-200/80", label_tone: "text-slate-500", value_tone: "text-[#2678b9]" },
                                  { label: "Assignments", value: assignmentsLoaded ? `${activeAssignments.length} active` : "—", box: "bg-white ring-1 ring-slate-200", label_tone: "text-slate-500", value_tone: "text-[#0b2341]" },
                                ]}
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-expanded={tripExpanded}
                            aria-controls={panelId}
                            onClick={() => toggleTrip(tripId)}
                            className="mt-2 flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2678b9]"
                          >
                            <span className="text-[11px] font-semibold leading-none text-[#1d5f94]">
                              {tripExpanded ? "Hide truck assignments" : "View truck assignments"}
                            </span>
                            {tripExpanded ? <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-[#1d5f94]" /> : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-[#1d5f94]" />}
                          </button>

                          {tripExpanded && (
                            <div id={panelId} className="border-t border-slate-200/70 bg-white/60 p-2.5">
                              {assignmentLoading[tripId] ? (
                                <p role="status" className="px-1 py-1 text-xs text-slate-500">Loading truck assignments…</p>
                              ) : assignmentErrors[tripId] ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                                  <p role="alert" className="text-xs text-rose-700">{assignmentErrors[tripId]}</p>
                                  <button type="button" onClick={() => void loadAssignments(tripId)} className="text-xs font-semibold text-[#2678b9] underline">Retry</button>
                                </div>
                              ) : assignments.length === 0 ? (
                                <p className="px-1 py-1 text-xs text-slate-500">No trucks assigned to this trip yet.</p>
                              ) : (
                                <>
                                  <ul className="grid gap-1.5">
                                    {assignments.map((assignment) => {
                                      const truck = assignment.truck ?? {};
                                      const driver = assignment.driver ?? {};
                                      const company = assignment.trucking_company ?? {};
                                      const assignmentDriverName = [driver.first_name, driver.last_name].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).join(" ");
                                      const capacity = Number(truck.capacity_cbm);
                                      const isUnassigned = Boolean(assignment.unassigned_at);
                                      return (
                                        <li key={assignment.id} className={`flex items-center gap-3 rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-200/80 ${isUnassigned ? "opacity-60" : ""}`}>
                                          <span
                                            aria-hidden="true"
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${isUnassigned ? "bg-slate-400" : "bg-gradient-to-br from-[#134a7c] to-[#2678b9]"}`}
                                          >
                                            <Truck className="h-4 w-4" />
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <p className="flex min-w-0 items-baseline gap-2">
                                              <span className="truncate text-xs font-bold text-[#0b2341]">{display(truck.plate_number, "Truck not recorded")}</span>
                                              <span className="truncate text-[10px] text-slate-400">{display(truck.truck_type, "Type not recorded")}</span>
                                            </p>
                                            <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] text-slate-500">
                                              <User aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-400" />
                                              <span className="truncate">
                                                {assignmentDriverName || "Driver not assigned"}
                                                <span className="text-slate-300"> / </span>
                                                {display(company.name, "Company not recorded")}
                                              </span>
                                            </p>
                                          </div>
                                          <div className="flex shrink-0 flex-col items-end gap-1">
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${isUnassigned ? "bg-slate-100 text-slate-500 ring-slate-500/10" : "bg-emerald-100 text-emerald-800 ring-emerald-600/25"}`}>
                                              {!isUnassigned && <CheckCircle2 aria-hidden="true" className="h-3 w-3" />}
                                              {isUnassigned ? "Unassigned" : "Assigned"}
                                            </span>
                                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[#1d5f94]">
                                              {Number.isFinite(capacity) && capacity > 0 ? `${capacity.toLocaleString()} CBM` : "Capacity not recorded"}
                                            </span>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-800 ring-1 ring-amber-200/70">
                                    <Info aria-hidden="true" className="h-3 w-3 shrink-0" />
                                    Cargo allocation is not tracked per truck yet
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}