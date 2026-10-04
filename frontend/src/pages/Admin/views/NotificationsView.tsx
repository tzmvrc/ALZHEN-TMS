import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { fetchNotifications, markNotificationAsRead, type AdminNotification } from "../../../services/notification.service";

export default function NotificationsView({ onOpen }: { onOpen: (item: AdminNotification) => void }) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readingId, setReadingId] = useState<string | null>(null);
  const readRequestInFlight = useRef(false);
  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const result = await fetchNotifications(accessToken);
      setItems(result.notifications);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);

  const openItem = async (item: AdminNotification) => {
    if (!accessToken) return;
    if (!item.read_at) {
      if (readRequestInFlight.current) return;
      readRequestInFlight.current = true;
      setReadingId(item.id);
      try {
        const result = await markNotificationAsRead(accessToken, item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: result.read_at } : entry));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to mark notification as read.");
        return;
      } finally {
        readRequestInFlight.current = false;
        setReadingId(null);
      }
    }
    onOpen(item);
  };

  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-100 p-2 text-amber-800"><Bell className="h-5 w-5" /></span><div><h1 className="text-xl font-bold text-[#0b2341]">Notifications</h1><p className="text-sm text-slate-500">Mentions and updates for your admin account.</p></div></div>
    {error && <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}<button type="button" className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
    {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading notifications…</p> : items.length ? <ul className="mt-5 divide-y divide-slate-100">{items.map((item) => <li key={item.id}><button type="button" disabled={readingId !== null} onClick={() => void openItem(item)} className={`flex w-full items-start gap-3 rounded-xl px-3 py-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-wait disabled:opacity-70 ${item.read_at ? "" : "bg-amber-50/50"}`}><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_at ? "bg-slate-300" : "bg-amber-500"}`} /><span className="min-w-0 flex-1"><span className="block text-sm text-slate-800">{item.message}</span><time className="mt-1 block text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></span>{item.read_at && <CheckCheck aria-label="Read" className="h-4 w-4 text-slate-400" />}</button></li>)}</ul> : !error && <p className="py-12 text-center text-sm text-slate-500">You have no notifications.</p>}
  </section>;
}
