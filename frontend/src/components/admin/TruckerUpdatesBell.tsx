import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { STAGE, useTruckerFeed } from "./LiveTripAlerts";

function ago(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Bell for the admin header. Must sit inside <LiveTripAlerts>. */
export default function TruckerUpdatesBell() {
  const feed = useTruckerFeed();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!feed) return null;
  const { history, unreadCount, markRead, markAllRead, clearHistory, openTrip, fresh } = feed;

  return (
    <div ref={root} className="relative">
      <style>{`
        @keyframes tub-ring { 0%,100% { transform: rotate(0); } 15% { transform: rotate(14deg); } 30% { transform: rotate(-12deg); } 45% { transform: rotate(8deg); } 60% { transform: rotate(-6deg); } }
        @keyframes tub-pop { from { transform: scale(0); } to { transform: scale(1); } }
        .tub-ring { animation: tub-ring 0.8s ease-in-out 2; transform-origin: 50% 0; }
        .tub-pop { animation: tub-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (prefers-reduced-motion: reduce) { .tub-ring, .tub-pop { animation: none; } }
      `}</style>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount ? `Driver updates, ${unreadCount} unread` : "Driver updates"}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#0b2341] transition hover:bg-[#e6f0f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
      >
        <Bell aria-hidden="true" className={`h-5 w-5 ${fresh ? "tub-ring" : ""}`} />
        {unreadCount > 0 && (
          <span key={unreadCount} className="tub-pop absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Driver updates" className="absolute right-0 top-12 z-[70] w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl bg-white shadow-[0_16px_40px_-8px_rgba(11,35,65,0.35)] ring-1 ring-slate-900/10">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-[#0b2341]">Driver updates</h2>
              <p className="text-[11px] text-slate-500">{unreadCount ? `${unreadCount} new` : "All caught up"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={markAllRead} disabled={!unreadCount} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-[#2678b9] transition hover:bg-[#e6f0f9] disabled:text-slate-300 disabled:hover:bg-transparent">
                <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" /> Mark all read
              </button>
              <button type="button" onClick={clearHistory} disabled={!history.length} aria-label="Clear all driver updates" className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40">
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>
          {history.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">No driver updates yet. They show up here the moment a driver reports in.</p>
          ) : (
            <ul className="max-h-[460px] divide-y divide-slate-100 overflow-y-auto">
              {history.map((item) => {
                const { color, Icon } = STAGE[item.stage];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        markRead(item.id);
                        setOpen(false);
                        openTrip(item.tripId, item.stopId);
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${item.read ? "" : "bg-[#f4f9fd]"}`}
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
                        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-[13px] ${item.read ? "font-medium text-slate-700" : "font-bold text-[#0b2341]"}`}>{item.title}</span>
                          {!item.read && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-[#2678b9]" />}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {[item.tripLabel, item.stopLabel, item.detail].filter(Boolean).join(" · ")}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{ago(item.at, now)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}