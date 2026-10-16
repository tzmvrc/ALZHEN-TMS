// src/components/admin/OverviewCalendarCard.tsx
// Mini month calendar for the Home page: grid on the left, selected day's events/notes on the right.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { fetchCalendarEvents } from "../../services/master-data.service";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import { surface } from "./dashboardStyles";

type CalendarEvent = Awaited<ReturnType<typeof fetchCalendarEvents>>[number];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDateKey(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}
const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parseDateKey(value));
const fullDate = (value: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(parseDateKey(value));

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/* Colour per kind of event: used for the day circle, the chip and the legend. */
type Kind = "trip" | "maintenance" | "payment" | "meeting" | "deadline";
const KINDS: Record<Kind, { label: string; circle: string; chip: string; bar: string; dot: string; ring: string }> = {
  trip: { label: "Trip", circle: "bg-[#cfe3f5] ring-[#2678b9]/60 hover:bg-[#b9d6ef]", chip: "bg-[#e6f0f9] text-[#2678b9]", bar: "bg-[#2678b9]", dot: "bg-[#2678b9]", ring: "ring-[#2678b9]" },
  maintenance: { label: "Maintenance", circle: "bg-amber-100 ring-amber-400/70 hover:bg-amber-200", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-400", dot: "bg-amber-400", ring: "ring-amber-400" },
  payment: { label: "Payment", circle: "bg-rose-100 ring-rose-400/70 hover:bg-rose-200", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-400", dot: "bg-rose-400", ring: "ring-rose-400" },
  meeting: { label: "Meeting", circle: "bg-emerald-100 ring-emerald-400/70 hover:bg-emerald-200", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", dot: "bg-emerald-500", ring: "ring-emerald-500" },
  deadline: { label: "Deadline", circle: "bg-violet-100 ring-violet-400/70 hover:bg-violet-200", chip: "bg-violet-100 text-violet-700", bar: "bg-violet-500", dot: "bg-violet-500", ring: "ring-violet-500" },
};
function kindOf(type?: string): Kind {
  const t = (type ?? "").toLowerCase();
  if (/maint|repair|service|inspect/.test(t)) return "maintenance";
  if (/pay|bill|invoice|due|payable/.test(t)) return "payment";
  if (/meet|call|review|training/.test(t)) return "meeting";
  if (/deadline|licen|expir|renew|permit|registration/.test(t)) return "deadline";
  return "trip";
}

/* Placeholder events, shown (and tagged "Sample data") only while the real calendar has none. */
function sampleEventsFor(month: Date): CalendarEvent[] {
  const y = month.getFullYear();
  const m = month.getMonth();
  const at = (day: number) => dateKey(new Date(y, m, day));
  const rows: [number, string, string, string][] = [
    [3, "Truck 12 oil change", "maintenance", "Scheduled service at the main depot, 9:00 AM."],
    [10, "Weekly dispatch meeting", "meeting", "Review delayed trips and driver assignments."],
    [10, "Supplier payment due", "payment", "Fuel supplier invoice, PHP 48,500."],
    [14, "Manila → Cebu delivery", "trip", "Departs 6:00 AM, 3 trucks assigned."],
    [14, "Insurance renewal", "deadline", "Fleet insurance expires at end of day."],
    [18, "Driver safety training", "meeting", "Mandatory session for new drivers."],
    [22, "Tire replacement – Truck 7", "maintenance", "Replace rear tires before long-haul trip."],
    [27, "Registration renewal", "deadline", "LTO registration for 4 vehicles."],
  ];
  return rows.map(([day, title, type, detail], i) => ({
    id: `sample-${i}`,
    date: at(day),
    title,
    type,
    detail,
  })) as unknown as CalendarEvent[];
}

export default function OverviewCalendarCard({
  onOpenCalendar,
  className = "",
}: {
  onOpenCalendar?: () => void;
  className?: string;
}) {
  const { accessToken } = useAuth();
  const today = dateKey(new Date());
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const from = dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const until = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetchCalendarEvents(accessToken, from, until)
      .then((result) => {
        if (!active) return;
        setEvents(result);
        setError("");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load calendar.");
      });
    return () => {
      active = false;
    };
  }, [accessToken, from, until, refreshVersion]);

  useEffect(() => subscribeToAdminRealtime((event) => {
    if (event.kind === "batch") {
      if (event.tables.some((table) => ["trips", "trip_events", "trip_stops", "store_calls", "customer_stores", "warehouses"].includes(table))) setRefreshVersion((version) => version + 1);
      return;
    }
    if (event.kind === "resume") {
      setRefreshVersion((version) => version + 1);
      return;
    }
    const table = event.kind === "change" ? event.payload.table : event.kind === "recovered" ? event.table : null;
    if (!table || !["trips", "trip_events", "trip_stops", "store_calls", "customer_stores", "warehouses"].includes(table)) return;
    setRefreshVersion((version) => version + 1);
  }), []);

  const gridDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const isSample = events.length === 0;
  const shownEvents = useMemo(
    () => (isSample ? sampleEventsFor(month) : events),
    [isSample, events, month],
  );

  const counts = useMemo(
    () =>
      shownEvents.reduce<Record<string, number>>((map, event) => {
        const key = event.date.slice(0, 10);
        map[key] = (map[key] ?? 0) + 1;
        return map;
      }, {}),
    [shownEvents],
  );
  /* Colour of a day = kind of its first event. */
  const dayKind = useMemo(() => {
    const map: Record<string, Kind> = {};
    for (const event of shownEvents) {
      const key = event.date.slice(0, 10);
      if (!map[key]) map[key] = kindOf(event.type);
    }
    return map;
  }, [shownEvents]);
  const selectedCount = counts[selectedDay] ?? 0;
  const dayEvents = useMemo(
    () => shownEvents.filter((event) => event.date.slice(0, 10) === selectedDay),
    [shownEvents, selectedDay],
  );

  const shiftMonth = (step: number) =>
    setMonth((value) => new Date(value.getFullYear(), value.getMonth() + step, 1));
  const goToday = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(dateKey(now));
  };

  const navBtn =
    "inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f7fa] text-slate-500 transition hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40";

  return (
    <section
      aria-label="Calendar"
      className={`${surface.card} flex min-h-0 min-w-0 flex-col overflow-hidden p-5 ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-[#2678b9]" />
          <h2 className={`${surface.heading} truncate`}>{monthLabel(month)}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={goToday} className={`${surface.chipGhost} !px-2.5 !py-1`}>
            Today
          </button>
          <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className={navBtn}>
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className={navBtn}>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-1 truncate rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700" title={error}>
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row">
        {/* Left: month grid */}
        <div className="w-full shrink-0 sm:w-[252px]">
          <div className="grid grid-cols-7 place-items-center gap-x-1 gap-y-1.5 text-center">
            {WEEKDAYS.map((label, index) => (
              <span key={`${label}-${index}`} className="py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </span>
            ))}
            {gridDays.map((day) => {
              const key = dateKey(day);
              const count = counts[key] ?? 0;
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = key === today;
              const isSelected = key === selectedDay;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  aria-pressed={isSelected}
                  aria-label={`${fullDate(key)}, ${count} event${count === 1 ? "" : "s"}`}
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[12px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${
                    isSelected
                      ? `bg-[#0b2341] font-bold text-white ${count > 0 ? `ring-2 ring-offset-1 ${KINDS[dayKind[key]].ring}` : ""}`
                      : isToday && count === 0
                        ? "bg-[#ffd43b] font-bold text-[#0b2341]"
                        : count > 0
                          ? `font-bold text-[#0b2341] ring-1 ${KINDS[dayKind[key]].circle} ${isToday ? "!ring-2 !ring-[#ffd43b]" : ""}`
                          : inMonth
                            ? "text-slate-600 hover:bg-[#f2f6fa]"
                            : "text-slate-300 hover:bg-[#f2f6fa]"
                  }`}
                >
                  {day.getDate()}
                  {count > 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1.5 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#2678b9] px-0.5 text-[9px] font-bold leading-none text-white"
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: events / notes for the selected day */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[12px] text-slate-500">
              <span className="font-semibold text-[#0b2341]">{shortDate(selectedDay)}</span> ·{" "}
              {selectedCount} {selectedCount === 1 ? "event" : "events"}
            </p>
            {onOpenCalendar && (
              <button
                type="button"
                onClick={onOpenCalendar}
                className="shrink-0 text-[11px] font-medium text-[#2678b9] hover:underline focus:outline-none focus-visible:underline"
              >
                Open calendar
              </button>
            )}
          </div>
          <ul
            className="max-h-[200px] min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 sm:max-h-none"
            aria-label={`Events on ${fullDate(selectedDay)}`}
          >
            {dayEvents.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400">
                No events or notes for this day.
              </li>
            ) : (
              dayEvents.map((event) => (
                <li key={event.id} className="flex overflow-hidden rounded-lg bg-[#f2f6fa]">
                  <span aria-hidden="true" className={`w-1 shrink-0 ${KINDS[kindOf(event.type)].bar}`} />
                  <div className="min-w-0 flex-1 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[12px] font-semibold text-[#0b2341]">{event.title}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${KINDS[kindOf(event.type)].chip}`}>
                        {event.type || KINDS[kindOf(event.type)].label}
                      </span>
                    </div>
                    {event.detail && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{event.detail}</p>}
                  </div>
                </li>
              ))
            )}
          </ul>
          <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5" aria-label="Event colours">
            {(Object.keys(KINDS) as Kind[]).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${KINDS[k].dot}`} />
                {KINDS[k].label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
