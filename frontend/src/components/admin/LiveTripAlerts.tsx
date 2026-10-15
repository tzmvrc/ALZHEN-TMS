import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  Package,
  PackageCheck,
  PackageOpen,
  MapPin,
  Truck,
  TriangleAlert,
  Volume2,
  VolumeX,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLiveTripActivity, type ActivityItem, type HistoryItem } from "./useLiveTripActivity";
import { TRACKER_STAGES, trackerIndex, type ActivityStage } from "../../services/live-activity.service";

/* ------------------------------------------------------------------ */
/* Which trucks just reported in. Read by the map to make them pulse.   */
/* ------------------------------------------------------------------ */

const EMPTY: ReadonlySet<string> = new Set();
const PingContext = createContext<ReadonlySet<string>>(EMPTY);
export const usePingingTrips = () => useContext(PingContext);

/* The persistent feed behind the bell (see TruckerUpdatesBell). */
type Feed = {
  history: HistoryItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearHistory: () => void;
  openTrip: (tripId: string, stopId: string | null) => void;
  /** True for a few seconds after a new update, so the bell can react. */
  fresh: boolean;
};
const FeedContext = createContext<Feed | null>(null);
export const useTruckerFeed = () => useContext(FeedContext);

/* ------------------------------------------------------------------ */
/* Look of each stage                                                    */
/* ------------------------------------------------------------------ */

export const STAGE: Record<ActivityStage, { color: string; Icon: LucideIcon }> = {
  warehouse: { color: "#64748b", Icon: Warehouse },
  loading: { color: "#d97706", Icon: PackageOpen },
  loaded: { color: "#0ea5e9", Icon: Package },
  route: { color: "#2678b9", Icon: Truck },
  arrived: { color: "#7c3aed", Icon: MapPin },
  unloading: { color: "#ea580c", Icon: PackageOpen },
  delivered: { color: "#059669", Icon: PackageCheck },
  receipt: { color: "#0d9488", Icon: FileText },
  alert: { color: "#dc2626", Icon: TriangleAlert },
};

const AUTO_DISMISS_MS = 10_000;
const MAX_VISIBLE = 4;
const MUTE_KEY = "live-trip-alerts-muted";

/* ------------------------------------------------------------------ */
/* Sound + tab title: so it is noticed even when staff look elsewhere   */
/* ------------------------------------------------------------------ */

function useChime(muted: boolean) {
  const context = useRef<AudioContext | null>(null);
  return (urgent: boolean) => {
    if (muted) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      context.current ??= new Ctor();
      const audio = context.current;
      void audio.resume();
      const notes = urgent ? [880, 660, 880] : [660, 880];
      notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + index * 0.14;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.24);
      });
    } catch {
      /* Browsers block audio until the page has been interacted with; that is fine. */
    }
  };
}

function useTitleFlash(latest: ActivityItem | undefined) {
  const original = useRef<string | null>(null);
  useEffect(() => {
    if (!latest || !document.hidden) return;
    original.current ??= document.title;
    const base = original.current;
    const message = `● ${latest.tripLabel}: ${latest.title}`;
    let on = false;
    const timer = window.setInterval(() => {
      on = !on;
      document.title = on ? message : base;
    }, 1000);
    const stop = () => {
      if (document.hidden) return;
      window.clearInterval(timer);
      document.title = base;
      original.current = null;
      document.removeEventListener("visibilitychange", stop);
    };
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", stop);
      document.title = base;
    };
  }, [latest?.id, latest?.at]);
}

/* ------------------------------------------------------------------ */
/* One alert card                                                        */
/* ------------------------------------------------------------------ */

function Tracker({ stage, color }: { stage: ActivityStage; color: string }) {
  const current = trackerIndex(stage);
  if (current < 0) return null;
  return (
    <ol aria-label="Trip progress" className="mt-3 flex items-start">
      {TRACKER_STAGES.map((step, index) => {
        const done = index < current || (index === current && stage === "receipt");
        const active = index === current && stage !== "receipt";
        return (
          <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center">
            {index > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-1/2 top-[9px] h-0.5 w-full -translate-y-1/2 rounded bg-slate-200"
              >
                <span
                  className="block h-full rounded transition-[width] duration-700"
                  style={{ width: index <= current ? "100%" : "0%", background: color }}
                />
              </span>
            )}
            <span
              className="relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 bg-white transition-colors"
              style={{ borderColor: done || active ? color : "#e2e8f0", background: done ? color : "#fff" }}
            >
              {done && <Check aria-hidden="true" className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
              {active && (
                <>
                  <span aria-hidden="true" className="lta-ping absolute inset-0 rounded-full" style={{ background: color }} />
                  <span aria-hidden="true" className="relative h-2 w-2 rounded-full" style={{ background: color }} />
                </>
              )}
            </span>
            <span
              className={`mt-1 max-w-full truncate text-[9px] leading-tight ${active ? "font-bold" : "font-medium text-slate-400"}`}
              style={active ? { color } : undefined}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AlertCard({
  item,
  onDismiss,
  onOpen,
}: {
  item: ActivityItem;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const { color, Icon } = STAGE[item.stage];
  const urgent = item.stage === "alert";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className="lta-in group relative w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_-8px_rgba(11,35,65,0.35)] ring-1 ring-slate-900/10"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
            <span aria-hidden="true" className="lta-ping absolute inset-0 rounded-full" style={{ background: color }} />
            <Icon aria-hidden="true" className="relative h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
              {item.tripLabel}
              <span className="ml-2 font-medium normal-case tracking-normal text-slate-400">
                {new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>
            <p className="text-[15px] font-bold leading-snug text-[#0b2341]">{item.title}</p>
            {(item.stopLabel || item.detail) && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {[item.stopLabel, item.detail].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss alert"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <Tracker stage={item.stage} color={color} />
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-white transition hover:brightness-110"
          style={{ background: color }}
        >
          {item.stage === "receipt" ? "Review receipt" : "View trip"}
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      {!item.sticky && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100">
          <span
            key={`${item.id}-${item.at}`}
            onAnimationEnd={onDismiss}
            className="lta-drain block h-full group-hover:[animation-play-state:paused]"
            style={{ background: color, animationDuration: `${AUTO_DISMISS_MS}ms` }}
          />
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Provider + stack. Mount once in the admin shell.                      */
/* ------------------------------------------------------------------ */

export default function LiveTripAlerts({
  onOpenTrip,
  children,
}: {
  onOpenTrip: (tripId: string, stopId: string | null) => void;
  children?: ReactNode;
}) {
  const { items, pingingTripIds, dismiss, dismissAll, history, unreadCount, markRead, markAllRead, clearHistory } = useLiveTripActivity();
  const [muted, setMuted] = useState(() => {
    try {
      return window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const chime = useChime(muted);
  const latest = items[0];
  useTitleFlash(latest);

  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!latest) return;
    const signature = `${latest.id}:${latest.at}`;
    if (announced.current === signature) return;
    announced.current = signature;
    chime(latest.stage === "alert");
    // chime is recreated every render and only depends on `muted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, latest?.at]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      /* Preference just will not persist. */
    }
  };

  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <PingContext.Provider value={pingingTripIds}>
      <FeedContext.Provider value={{ history, unreadCount, markRead, markAllRead, clearHistory, openTrip: onOpenTrip, fresh: pingingTripIds.size > 0 }}>
      {children}
      <style>{`
        @keyframes lta-in { from { opacity: 0; transform: translateX(28px) scale(0.96); } to { opacity: 1; transform: none; } }
        @keyframes lta-ping { 0% { transform: scale(1); opacity: 0.5; } 80%, 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes lta-drain { from { width: 100%; } to { width: 0%; } }
        .lta-in { animation: lta-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .lta-ping { animation: lta-ping 1.8s ease-out infinite; }
        .lta-drain { animation-name: lta-drain; animation-timing-function: linear; animation-fill-mode: forwards; }
        @media (prefers-reduced-motion: reduce) { .lta-in, .lta-ping { animation: none; } }
      `}</style>
      {visible.length > 0 && (
        <div aria-live="polite" className="pointer-events-none fixed right-4 top-20 z-[80] flex flex-col items-end gap-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#0b2341] px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg">
            <span aria-hidden="true" className="relative flex h-2 w-2">
              <span className="lta-ping absolute inset-0 rounded-full bg-emerald-400" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live from drivers
            <button type="button" onClick={toggleMute} aria-label={muted ? "Turn alert sound on" : "Turn alert sound off"} className="rounded-full p-1 hover:bg-white/15">
              {muted ? <VolumeX aria-hidden="true" className="h-3.5 w-3.5" /> : <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />}
            </button>
            {items.length > 1 && (
              <button type="button" onClick={dismissAll} className="rounded-full px-1.5 py-0.5 text-white/80 hover:bg-white/15 hover:text-white">
                Clear all
              </button>
            )}
          </div>
          {visible.map((item) => (
            <div key={item.id} className="pointer-events-auto">
              <AlertCard
                item={item}
                onDismiss={() => dismiss(item.id)}
                onOpen={() => {
                  onOpenTrip(item.tripId, item.stopId);
                  dismiss(item.id);
                }}
              />
            </div>
          ))}
          {hidden > 0 && (
            <p className="pointer-events-auto rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow ring-1 ring-slate-900/10">
              +{hidden} more update{hidden === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
      </FeedContext.Provider>
    </PingContext.Provider>
  );
}