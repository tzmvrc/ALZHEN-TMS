import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  fetchNotifications,
  markNotificationAsRead,
  type AdminNotification,
} from "../../services/notification.service";

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

/** Facebook-style panel that drops down under the bell, on the same page. */
export default function NotificationsDropdown({
  onOpenItem,
  onViewAll,
  onChanged,
}: {
  onOpenItem: (item: AdminNotification) => void;
  onViewAll: () => void;
  onChanged?: () => void;
}) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const busy = useRef(false);

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

  useEffect(() => {
    void load();
  }, [load]);

  const openItem = async (item: AdminNotification) => {
    if (!accessToken || busy.current) return;
    if (!item.read_at) {
      busy.current = true;
      try {
        const result = await markNotificationAsRead(accessToken, item.id);
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, read_at: result.read_at } : entry,
          ),
        );
        onChanged?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to mark notification as read.");
        return;
      } finally {
        busy.current = false;
      }
    }
    onOpenItem(item);
  };

  const visible = (filter === "unread" ? items.filter((i) => !i.read_at) : items).slice(0, 10);

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full z-50 mt-3 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)]">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-[#0b2341]">
          Notifications
        </h2>
        <div className="mt-3 flex gap-1.5">
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40 ${
                filter === value
                  ? "bg-[#ffd43b] text-[#0b2341]"
                  : "text-slate-500 hover:bg-slate-100"
              }`}>
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[min(420px,60vh)] overflow-y-auto px-2 pb-2">
        {error && (
          <p role="alert" className="mx-2 mb-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
            {error}
            <button type="button" className="ml-2 underline" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
        {loading ? (
          <p className="py-10 text-center text-[13px] text-slate-500">Loading…</p>
        ) : visible.length === 0 ? (
          !error && (
            <p className="py-10 text-center text-[13px] text-slate-500">
              {filter === "unread" ? "You're all caught up." : "You have no notifications."}
            </p>
          )
        ) : (
          <ul>
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openItem(item)}
                  className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[#2678b9]">
                    <Bell className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`line-clamp-2 block text-[13px] ${
                        item.read_at ? "text-slate-600" : "font-medium text-slate-900"
                      }`}>
                      {item.message}
                    </span>
                    <time
                      className={`mt-0.5 block text-[11px] ${
                        item.read_at ? "text-slate-400" : "font-medium text-[#2678b9]"
                      }`}>
                      {timeAgo(item.created_at)}
                    </time>
                  </span>
                  {!item.read_at && (
                    <span
                      aria-label="Unread"
                      className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2678b9]"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 p-2">
        <button
          type="button"
          onClick={onViewAll}
          className="w-full rounded-xl py-2 text-center text-[13px] font-semibold text-[#0b2341] transition-colors hover:bg-[#ffd43b]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40">
          See all notifications
        </button>
      </div>
    </div>
  );
}