import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { tableUi } from "../../../components/admin/dashboardStyles";
import { fetchCalendarEvents } from "../../../services/master-data.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function monthLabel(date: Date) { return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date); }
function parseDateKey(value: string) { const [year, month, day] = value.slice(0, 10).split("-").map(Number); return new Date(year, month - 1, day); }
function fullDate(value: string) { return new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(parseDateKey(value)); }

export default function CalendarView() {
  const { accessToken } = useAuth();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [events, setEvents] = useState<Awaited<ReturnType<typeof fetchCalendarEvents>>>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const from = dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const until = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetchCalendarEvents(accessToken, from, until).then((result) => { if (active) { setEvents(result); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load calendar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, from, until, refreshVersion]);

  useEffect(() => subscribeToAdminRealtime((event) => {
    if (event.kind === "resume") {
      setRefreshVersion((version) => version + 1);
      return;
    }
    const table = event.kind === "change" ? event.payload.table : event.table;
    if (["trips", "trip_events", "trip_stops", "store_calls", "customer_stores", "warehouses"].includes(table ?? "")) {
      setRefreshVersion((version) => version + 1);
    }
  }), []);

  useEffect(() => subscribeToAdminRealtime((event) => {
    const table = event.kind === "change" ? event.payload.table : event.kind === "recovered" ? event.table : null;
    if (table === "trips" || table === "trip_events") setRefreshVersion((version) => version + 1);
  }), []);

  useEffect(() => {
    if (!selectedDay) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedDay(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDay]);

  const gridDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);
  const byDay = useMemo(() => events.reduce<Record<string, typeof events>>((map, event) => {
    const key = event.date.slice(0, 10); (map[key] ??= []).push(event); return map;
  }, {}), [events]);
  const selectedEvents = useMemo(() => selectedDay ? byDay[selectedDay] ?? [] : [], [byDay, selectedDay]);
  const selectedEvent = selectedEvents.find((event) => event.id === selectedEventId) ?? null;
  const groupedEvents = useMemo(() => selectedEvents.reduce<Record<string, typeof selectedEvents>>((groups, event) => {
    (groups[event.type || "Other"] ??= []).push(event); return groups;
  }, {}), [selectedEvents]);
  const today = dateKey(new Date());

  return <div className="mx-auto w-full max-w-5xl">
    <section className={`${tableUi.shell} overflow-hidden`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#2678b9]" /><h2 className="text-base font-semibold text-[#0b2341]">{monthLabel(month)}</h2></div><div className="flex items-center gap-2"><button type="button" onClick={() => { setLoading(true); setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Today</button><button type="button" aria-label="Previous month" onClick={() => { setLoading(true); setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1)); }} className={tableUi.iconBtn}><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Next month" onClick={() => { setLoading(true); setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1)); }} className={tableUi.iconBtn}><ChevronRight className="h-4 w-4" /></button></div></header>
      {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid grid-cols-7">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="border-b border-r border-slate-100 bg-slate-50 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:px-2 sm:text-[11px]">{day}</div>)}
        {gridDays.map((day) => { const key = dateKey(day); const dayEvents = byDay[key] ?? []; const isCurrentMonth = day.getMonth() === month.getMonth(); return <button key={key} type="button" onClick={() => { setSelectedDay(key); setSelectedEventId(null); }} aria-label={`${fullDate(key)}, ${dayEvents.length} events`} className={`min-h-20 border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-blue-50/50 sm:min-h-24 sm:p-2 ${!isCurrentMonth ? "bg-slate-50/60 text-slate-300" : "bg-white text-slate-700"}`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${key === today ? "bg-[#ffd43b] font-bold text-[#0b2341]" : ""}`}>{day.getDate()}</span><span className="mt-1 block space-y-1">{dayEvents.slice(0, 2).map((event) => <span key={event.id} className="block truncate rounded bg-[#e6f0f9] px-1.5 py-1 text-[10px] font-medium text-[#0b2341]" title={event.title}>{event.title}</span>)}{dayEvents.length > 2 && <span className="block px-1 text-[10px] text-slate-500">+{dayEvents.length - 2} more</span>}</span></button>; })}</div>
      {loading && <p role="status" className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Loading calendar events…</p>}
    </section>

    {selectedDay && <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-[#0b2341]/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDay(null); }}><section role="dialog" aria-modal="true" aria-labelledby="calendar-day-title" className="max-h-[82vh] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-[#2678b9]">Calendar day</p><h2 id="calendar-day-title" className="mt-1 text-base font-semibold text-[#0b2341]">{fullDate(selectedDay)}</h2><p className="mt-1 text-xs text-slate-500">{selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}</p></div><button type="button" onClick={() => setSelectedDay(null)} aria-label="Close day details" className={tableUi.iconBtn}><X className="h-4 w-4" /></button></header><div className="max-h-[calc(82vh-90px)] overflow-y-auto p-5">{loading ? <p className="py-8 text-center text-sm text-slate-500">Loading events…</p> : selectedEvents.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">No events for this day.</p> : <div className="space-y-4">{Object.entries(groupedEvents).map(([type, items]) => <section key={type}><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{type}</h3><ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">{items.map((event) => <li key={event.id}><button type="button" onClick={() => setSelectedEventId(event.id)} aria-pressed={selectedEvent?.id === event.id} className={`w-full px-3 py-3 text-left transition ${selectedEvent?.id === event.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-[#0b2341]">{event.title}</span><span className="shrink-0 text-[10px] text-slate-400">{event.type}</span></div><p className="mt-1 text-xs leading-5 text-slate-600">{event.detail}</p></button></li>)}</ul></section>)}</div>}</div></section></div>}
  </div>;
}
