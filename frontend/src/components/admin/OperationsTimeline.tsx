import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  MapPin,
  PackageCheck,
  PackageMinus,
  PackageOpen,
  Timer,
  Undo2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type {ReportEvidence} from "../../services/operations-report.service";
import {cleanActivityNote} from "../../services/activity-presentation";
import { usePingingTrips } from "./LiveTripAlerts";

/* ------------------------------------------------------------------ */
/* Types: loose on purpose so the report records pass straight in.       */
/* ------------------------------------------------------------------ */

export type OpsLoading = {
  id: string;
  warehouse_arrival_at?: unknown;
  loading_start_at?: unknown;
  loading_finished_at?: unknown;
};

export type OpsStop = {
  id: string;
  reportId?: string;
  /** "Stop 2" */
  label: string;
  storeName: string;
  arrival: unknown;
  start: unknown;
  finish: unknown;
  remarks?: string | null;
};

export type OpsScope = {
  id: string;
  trip_stop_id?: unknown;
  reason?: unknown;
  number_of_boxes?: unknown;
  comments?: unknown;
  created_at?: unknown;
};

/* ------------------------------------------------------------------ */
/* Themes. Class names are written out in full so Tailwind keeps them.   */
/* ------------------------------------------------------------------ */

type Theme = {
  solid: string; soft: string; text: string; border: string; ring: string; bar: string; track: string; hex: string;
};

const THEME = {
  amber: { solid: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", ring: "ring-amber-300", bar: "bg-amber-400", track: "bg-amber-100", hex: "#f59e0b" },
  sky: { solid: "bg-sky-600", soft: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", ring: "ring-sky-300", bar: "bg-sky-500", track: "bg-sky-100", hex: "#0284c7" },
  orange: { solid: "bg-orange-500", soft: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", ring: "ring-orange-300", bar: "bg-orange-400", track: "bg-orange-100", hex: "#f97316" },
  violet: { solid: "bg-violet-600", soft: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", ring: "ring-violet-300", bar: "bg-violet-500", track: "bg-violet-100", hex: "#7c3aed" },
  emerald: { solid: "bg-emerald-600", soft: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", ring: "ring-emerald-300", bar: "bg-emerald-500", track: "bg-emerald-100", hex: "#059669" },
  indigo: { solid: "bg-indigo-600", soft: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", ring: "ring-indigo-300", bar: "bg-indigo-500", track: "bg-indigo-100", hex: "#4f46e5" },
  rose: { solid: "bg-rose-600", soft: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", ring: "ring-rose-300", bar: "bg-rose-500", track: "bg-rose-100", hex: "#e11d48" },
  slate: { solid: "bg-slate-400", soft: "bg-slate-50", text: "text-slate-500", border: "border-slate-200", ring: "ring-slate-300", bar: "bg-slate-300", track: "bg-slate-200", hex: "#94a3b8" },
} satisfies Record<string, Theme>;

/* ------------------------------------------------------------------ */
/* Time helpers                                                          */
/* ------------------------------------------------------------------ */

const FRESH_MS = 5 * 60_000;

function toMs(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function span(from: number | null, to: number | null): string | null {
  if (from === null || to === null || to < from) return null;
  const minutes = Math.round((to - from) / 60_000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function ago(time: number, now: number): string {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(time).toLocaleDateString();
}

const clock = (time: number) => new Date(time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", timeZone:"Asia/Manila" });
const day = (time: number) => new Date(time).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone:"Asia/Manila" });

/* ------------------------------------------------------------------ */
/* Building blocks                                                       */
/* ------------------------------------------------------------------ */

type Step = { label: string; at: number | null; Icon: LucideIcon };

/** Horizontal progress: done steps filled and timed, the next step pulsing, the rest greyed. */
function Stepper({ steps, theme, now, activeLabel }: { steps: Step[]; theme: Theme; now: number; activeLabel: string }) {
  const doneCount = steps.filter((step) => step.at !== null).length;
  const currentIndex = doneCount > 0 && doneCount < steps.length ? doneCount : -1;
  return (
    <ol className="flex items-start">
      {steps.map((step, index) => {
        const done = step.at !== null;
        const current = index === currentIndex;
        const fresh = done && now - (step.at as number) < FRESH_MS;
        return (
          <li key={step.label} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
            {index > 0 && (
              <span aria-hidden="true" className={`absolute right-1/2 top-[17px] h-1 w-full -translate-y-1/2 rounded-full ${THEME.slate.track}`}>
                <span className={`block h-full rounded-full transition-[width] duration-700 ${theme.bar}`} style={{ width: done ? "100%" : current ? "50%" : "0%" }} />
              </span>
            )}
            <span
              className={`relative z-10 flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 transition-colors ${
                done ? `${theme.solid} border-white text-white shadow-md` : current ? `bg-white ${theme.text} border-current` : "border-slate-200 bg-white text-slate-300"
              } ${fresh ? `ring-4 ${theme.ring}` : ""}`}
            >
              {current && <span aria-hidden="true" className="ot-ping absolute inset-0 rounded-full" style={{ background: theme.hex }} />}
              {done ? <Check aria-hidden="true" className="relative h-4 w-4" strokeWidth={3.5} /> : <step.Icon aria-hidden="true" className="relative h-4 w-4" />}
            </span>
            <span className={`mt-1.5 text-[11px] font-semibold leading-tight ${done ? "text-[#0b2341]" : current ? theme.text : "text-slate-400"}`}>{step.label}</span>
            {done ? (
              <span className="mt-0.5 text-[11px] leading-tight text-slate-500">
                <span className="font-semibold tabular-nums text-slate-700">{clock(step.at as number)}</span>
                <span className="block text-[10px] text-slate-400">{fresh ? <span className={`font-bold ${theme.text}`}>NEW · {ago(step.at as number, now)}</span> : `${day(step.at as number)}`}</span>
              </span>
            ) : (
              <span className={`mt-0.5 text-[10px] font-medium ${current ? theme.text : "text-slate-300"}`}>{current ? activeLabel : "Waiting"}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ theme, children, icon }: { theme: Theme; children: ReactNode; icon?: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.soft} ${theme.text}`}>{icon}{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Stop status from its timestamps                                       */
/* ------------------------------------------------------------------ */

function stopState(stop: OpsStop) {
  if (toMs(stop.finish) !== null) return { key: "done", label: "Delivered", theme: THEME.emerald };
  if (toMs(stop.start) !== null) return { key: "unloading", label: "Unloading now", theme: THEME.orange };
  if (toMs(stop.arrival) !== null) return { key: "arrived", label: "At the store", theme: THEME.violet };
  return { key: "pending", label: "Not arrived", theme: THEME.slate };
}

/* ------------------------------------------------------------------ */
/* Main component                                                        */
/* ------------------------------------------------------------------ */

export default function OperationsTimeline({
  tripId,
  loading,
  stops,
  backloads,
  offloads,
  stopLabel,
  error,
  expanded = false,
  evidence = [],
}: {
  tripId: string;
  loading: OpsLoading[];
  stops: OpsStop[];
  backloads: OpsScope[];
  offloads: OpsScope[];
  /** trip_stop_id → "Stop 2 · Store name" */
  stopLabel: (stopId: string) => string | null;
  error?: string | null;
  expanded?: boolean;
  evidence?: ReportEvidence[];
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const live = usePingingTrips().has(tripId);

  /* ---- loading ---- */
  const report = loading[0];
  const arrival = toMs(report?.warehouse_arrival_at);
  const loadStart = toMs(report?.loading_start_at);
  const loadEnd = toMs(report?.loading_finished_at);
  const loadingSteps: Step[] = [
    { label: "Warehouse arrival", at: arrival, Icon: Warehouse },
    { label: "Loading started", at: loadStart, Icon: PackageOpen },
    { label: "Loading finished", at: loadEnd, Icon: PackageCheck },
  ];
  const loadingState = loadEnd !== null
    ? { value: "Complete", hint: `Loaded in ${span(loadStart, loadEnd) ?? "—"}`, active: false }
    : loadStart !== null
      ? { value: "Loading now", hint: `Started ${ago(loadStart, now)}`, active: true }
      : arrival !== null
        ? { value: "At warehouse", hint: `Arrived ${ago(arrival, now)}`, active: true }
        : { value: "Not started", hint: "No loading recorded", active: false };

  /* ---- unloading ---- */
  const deliveredStops = stops.filter((stop) => toMs(stop.finish) !== null).length;
  const activeStop = stops.find((stop) => toMs(stop.start) !== null && toMs(stop.finish) === null)
    ?? stops.find((stop) => toMs(stop.arrival) !== null && toMs(stop.finish) === null);
  const unloadingTile = activeStop
    ? { value: toMs(activeStop.start) !== null ? "Unloading now" : "At the store", hint: `${activeStop.label} · ${activeStop.storeName}`, active: true }
    : { value: `${deliveredStops} / ${stops.length}`, hint: stops.length ? "stops delivered" : "No stops recorded", active: false };

  /* ---- accordion: the step the driver is on opens by itself; finished steps collapse with a check ---- */
  const lastRecordAt = (records: OpsScope[]) => records.reduce((max, record) => Math.max(max, toMs(record.created_at) ?? 0), 0);
  const freshAt = (records: OpsScope[]) => {
    const time = lastRecordAt(records);
    return time > 0 && now - time < FRESH_MS ? time : 0;
  };
  const loadingDone = loadEnd !== null;
  const unloadingDone = stops.length > 0 && deliveredStops === stops.length;
  const backFresh = freshAt(backloads);
  const offFresh = freshAt(offloads);
  /* A brand-new backload/offload record is a driver update too, so it takes the open spot for a few minutes. */
  const freshKey = backFresh || offFresh ? (backFresh >= offFresh ? "backload" : "offload") : null;
  const activeKey = freshKey ?? (!loadingDone ? "loading" : stops.length > 0 && !unloadingDone ? "unloading" : null);

  /* A manual open/close is kept until the active step changes. */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOverrides({});
  }, [activeKey]);

  const scopeChip = (records: OpsScope[]) => {
    if (records.length === 0) return "None";
    const boxes = records.reduce((sum, record) => sum + (Number(record.number_of_boxes) || 0), 0);
    return `${records.length} record${records.length === 1 ? "" : "s"} · ${boxes} box${boxes === 1 ? "" : "es"}`;
  };

  if(expanded)return <div className="trip-operations-overview">
    {error&&<p role="status" className="trip-empty-note">{error}</p>}
    <section className="trip-phase-summary"><h3><Warehouse size={16} aria-hidden="true"/>Loading timeline <small>{loadingState.value}</small></h3><CompactMilestones steps={loadingSteps}/><ReportImages recordId={report?.id} evidence={evidence}/>{!report&&<p>No loading record.</p>}</section>
    <section className="trip-phase-summary trip-unloading-summary"><h3><MapPin size={16} aria-hidden="true"/>Unloading timelines <small>{deliveredStops}/{stops.length} stops</small></h3>{stops.length?stops.map(stop=><article key={stop.id}><header><strong>{stop.label} / {stop.storeName}</strong><span data-complete={toMs(stop.finish)!==null||undefined}>{stopState(stop).label}</span></header><CompactMilestones steps={[{label:'Arrival',at:toMs(stop.arrival),Icon:MapPin},{label:'Started',at:toMs(stop.start),Icon:PackageOpen},{label:'Finished',at:toMs(stop.finish),Icon:PackageCheck}]}/>{stop.remarks&&<p>{cleanActivityNote(stop.remarks)}</p>}<ReportImages recordId={stop.reportId} evidence={evidence}/></article>):<p>No unloading records.</p>}</section>
    <div className="trip-exceptions-summary">{[{title:'Backload records',records:backloads,Icon:Undo2},{title:'Offload records',records:offloads,Icon:PackageMinus}].map(({title,records,Icon})=><section key={title} className="trip-phase-summary"><h3><Icon size={16} aria-hidden="true"/>{title}<small>{records.length}</small></h3>{records.length?records.map(record=><article key={record.id}><strong>{cleanActivityNote(String(record.reason??'No reason recorded'))}</strong><small>{typeof record.trip_stop_id==='string'?stopLabel(record.trip_stop_id):'Trip-wide'}{typeof record.created_at==='string'?` / ${clock(Date.parse(record.created_at))} ${day(Date.parse(record.created_at))}`:''}</small>{record.comments!=null&&<p>{cleanActivityNote(String(record.comments))}</p>}<ReportImages recordId={record.id} evidence={evidence}/></article>):<p>No records.</p>}</section>)}</div>
  </div>;

  const sections = [
    {
      key: "loading", title: "Loading timeline", subtitle: loadingState.hint, theme: THEME.amber, Icon: Warehouse,
      done: loadingDone, hasData: loading.length > 0, chip: loadingState.value,
      body: (
        <>
          <div className="p-4">
            {loading.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">No loading timeline has been recorded.</p>
            ) : (
              <>
                {loadStart !== null && loadEnd === null && (
                  <div className="mb-4 overflow-hidden rounded-full bg-amber-100"><div className="ot-stripes h-2 w-full rounded-full bg-amber-400" /></div>
                )}
                <Stepper steps={loadingSteps} theme={THEME.amber} now={now} activeLabel="In progress" /><ReportImages recordId={report?.id} evidence={evidence}/>
                <div className="mt-4 flex flex-wrap gap-2">
                  {span(arrival, loadStart) && <Chip theme={THEME.slate} icon={<Timer aria-hidden="true" className="h-3.5 w-3.5" />}>Waited {span(arrival, loadStart)} before loading</Chip>}
                  {span(loadStart, loadEnd) && <Chip theme={THEME.amber} icon={<Timer aria-hidden="true" className="h-3.5 w-3.5" />}>Loading took {span(loadStart, loadEnd)}</Chip>}
                </div>
              </>
            )}
          </div>
        </>
      ),
    },
    {
      key: "unloading", title: "Unloading timelines", subtitle: unloadingTile.hint, theme: THEME.sky, Icon: MapPin,
      done: unloadingDone, hasData: stops.length > 0, chip: stops.length ? `${deliveredStops} of ${stops.length} delivered` : "No stops",
      body: (
        <>
          <div className="space-y-3 p-4">
            {stops.length === 0 ? <p className="py-3 text-center text-xs text-slate-500">No stops are recorded.</p> : stops.map((stop) => {
              const state = stopState(stop);
              const arrive = toMs(stop.arrival);
              const start = toMs(stop.start);
              const finish = toMs(stop.finish);
              const steps: Step[] = [
                { label: "Store arrival", at: arrive, Icon: MapPin },
                { label: "Unloading started", at: start, Icon: PackageOpen },
                { label: "Unloading finished", at: finish, Icon: PackageCheck },
              ];
              return (
                <div key={stop.id} className={`relative overflow-hidden rounded-xl border p-3 pl-4 ${state.theme.soft} ${state.theme.border}`}>
                  <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${state.theme.solid}`} />
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[#0b2341]">{stop.label} <span className="font-medium text-slate-500">· {stop.storeName}</span></p>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${state.theme.solid}`}>
                      {state.key === "unloading" && <span aria-hidden="true" className="relative flex h-1.5 w-1.5"><span className="ot-ping absolute inset-0 rounded-full bg-white" /><span className="relative h-1.5 w-1.5 rounded-full bg-white" /></span>}
                      {state.label}
                    </span>
                  </div>
                  {state.key === "unloading" && <div className="mb-3 overflow-hidden rounded-full bg-orange-100"><div className="ot-stripes h-1.5 w-full rounded-full bg-orange-400" /></div>}
                  <Stepper steps={steps} theme={state.key === "pending" ? THEME.sky : state.theme} now={now} activeLabel={state.key === "pending" ? "Not yet" : "In progress"} />
                  {(span(arrive, start) || span(start, finish)) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {span(arrive, start) && <Chip theme={THEME.slate} icon={<Timer aria-hidden="true" className="h-3.5 w-3.5" />}>Waited {span(arrive, start)}</Chip>}
                      {span(start, finish) && <Chip theme={state.theme} icon={<Timer aria-hidden="true" className="h-3.5 w-3.5" />}>Unloaded in {span(start, finish)}</Chip>}
                    </div>
                  )}
                  <ReportImages recordId={stop.reportId} evidence={evidence}/>{stop.remarks && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-600">{cleanActivityNote(stop.remarks)}</p>}
                </div>
              );
            })}
          </div>
        </>
      ),
    },
    {
      key: "backload", title: "Backload records", subtitle: "Goods sent back to the warehouse", theme: THEME.indigo, Icon: Undo2,
      done: backloads.length > 0 && unloadingDone, hasData: backloads.length > 0, chip: scopeChip(backloads),
      body: <ScopeBody theme={THEME.indigo} Icon={Undo2} records={backloads} stopLabel={stopLabel} now={now} evidence={evidence} />,
    },
    {
      key: "offload", title: "Offload records", subtitle: "Goods taken off the truck", theme: THEME.rose, Icon: PackageMinus,
      done: offloads.length > 0 && unloadingDone, hasData: offloads.length > 0, chip: scopeChip(offloads),
      body: <ScopeBody theme={THEME.rose} Icon={PackageMinus} records={offloads} stopLabel={stopLabel} now={now} evidence={evidence} />,
    },
  ];

  return (
    <div>
      <style>{`
        @keyframes ot-ping { 0% { transform: scale(1); opacity: 0.45; } 80%, 100% { transform: scale(1.7); opacity: 0; } }
        @keyframes ot-stripes { from { background-position: 0 0; } to { background-position: 28px 0; } }
        .ot-ping { animation: ot-ping 1.8s ease-out infinite; }
        .ot-stripes { background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0 8px, transparent 8px 16px); background-size: 28px 28px; animation: ot-stripes 0.9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .ot-ping, .ot-stripes { animation: none; } }
      `}</style>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e6f0f9] text-[#2678b9]"><Clock className="h-4 w-4" /></span>
          <h3 className="text-sm font-semibold text-[#0b2341]">Loading, unloading, backload &amp; offload</h3>
        </div>
        {live && (
          <span role="status" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow">
            <span aria-hidden="true" className="relative flex h-2 w-2"><span className="ot-ping absolute inset-0 rounded-full bg-white" /><span className="relative h-2 w-2 rounded-full bg-white" /></span>
            Driver just updated
          </span>
        )}
      </header>

      {error && <p role="status" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">{error}</p>}

      <ol className={expanded?"trip-inline-report-grid":"mt-4 space-y-3"}>
        {sections.map((section) => {
          const state = section.done ? "done" : section.key === activeKey ? "active" : section.hasData ? "recorded" : "empty";
          const open = expanded || (overrides[section.key] ?? section.key === activeKey);
          const chipTheme = state === "done" ? THEME.emerald : state === "empty" ? THEME.slate : section.theme;
          const panelId = `ot-panel-${section.key}`;
          return (
            <li key={section.key} className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${section.theme.border} ${state === "active" ? `ring-2 ${section.theme.ring}` : ""}`}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                disabled={expanded}
                onClick={() => setOverrides((current) => ({ ...current, [section.key]: !open }))}
                className={`flex w-full items-center gap-2.5 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2678b9] ${section.theme.soft} ${open ? `border-b ${section.theme.border}` : ""}`}
              >
                <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-colors duration-500 ${state === "done" ? THEME.emerald.solid : section.theme.solid}`}>
                  {state === "active" && <span aria-hidden="true" className="ot-ping absolute inset-0 rounded-full" style={{ background: section.theme.hex }} />}
                  {state === "done" ? <Check aria-hidden="true" className="relative h-4 w-4" strokeWidth={3.5} /> : <section.Icon aria-hidden="true" className="relative h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#0b2341]">{section.title}</span>
                  <span className="block truncate text-[11px] text-slate-500">{section.subtitle}</span>
                </span>
                <Chip theme={chipTheme}>{section.chip}</Chip>
                {!expanded&&<ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />}
              </button>
              <div
                id={panelId}
                role="region"
                aria-label={section.title}
                className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className={`min-h-0 overflow-hidden ${open ? "" : "invisible"}`}>{section.body}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ScopeBody({
  theme, Icon, records, stopLabel, now, evidence,
}: {
  theme: Theme; Icon: LucideIcon; records: OpsScope[];
  stopLabel: (stopId: string) => string | null; now: number; evidence:ReportEvidence[];
}) {
  return (
    <div>
      <div className="p-4">
        {records.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${theme.soft} ${theme.text}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
            <p className="text-sm text-slate-500">No records.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {records.map((record) => {
              const stopId = typeof record.trip_stop_id === "string" ? record.trip_stop_id : null;
              const created = toMs(record.created_at);
              const fresh = created !== null && now - created < FRESH_MS;
              const reason = typeof record.reason === "string" && record.reason.trim() ? cleanActivityNote(record.reason) : "No reason recorded";
              const boxes = record.number_of_boxes === null || record.number_of_boxes === undefined || record.number_of_boxes === "" ? null : String(record.number_of_boxes);
              const comments = typeof record.comments === "string" && record.comments.trim() ? record.comments.trim() : null;
              return (
                <li key={record.id} className={`flex items-stretch gap-3 rounded-xl border p-3 ${theme.soft} ${theme.border} ${fresh ? `ring-4 ${theme.ring}` : ""}`}>
                  <div className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-lg text-white ${theme.solid}`}>
                    <span className="text-xl font-extrabold leading-none tabular-nums">{boxes ?? "—"}</span>
                    <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-90">box{boxes === "1" ? "" : "es"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[#0b2341]">{reason}</p>
                      {fresh && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${theme.solid}`}>NEW</span>}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {stopId ? stopLabel(stopId) ?? "Delivery stop" : "Whole trip"}
                      {created !== null && ` · ${clock(created)} · ${ago(created, now)}`}
                    </p>
                    <ReportImages recordId={record.id} evidence={evidence}/>{comments && <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">{cleanActivityNote(comments)}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
function ReportImages({recordId,evidence}:{recordId?:string;evidence:ReportEvidence[]}){
 const files=recordId?evidence.filter(file=>[file.loading_report_id,file.unloading_report_id,file.backload_id,file.offload_id].includes(recordId)):[];
 if(!files.length)return null;
 return <div className="trip-report-evidence" aria-label="Trip-wide report attachments">{files.map(file=><a key={file.id} href={file.signed_url??undefined} target="_blank" rel="noopener noreferrer" aria-label={`Open report attachment ${file.file_name}`}>{file.signed_url?<img loading="lazy" src={file.signed_url} alt={file.file_name}/>:<span>Image link unavailable</span>}</a>)}</div>;
}

function CompactMilestones({steps}:{steps:Step[]}){
 return <ol className="trip-compact-milestones">{steps.map(({label,at,Icon})=><li key={label} data-recorded={at!==null||undefined}><span><Icon size={13} aria-hidden="true"/>{label}</span><strong>{at===null?'Not recorded':clock(at)}</strong>{at!==null&&<time dateTime={new Date(at).toISOString()}>{day(at)}</time>}</li>)}</ol>;
}
