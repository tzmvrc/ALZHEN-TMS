import { useEffect, useState } from "react";
import DriverUpdateCard, { driverUpdateColor } from "./DriverUpdateCard";
import type { AdminNotification } from "../../services/notification.service";

const DISPLAY_MS = 8_000;
const EXIT_MS = 260;

/** A transient view of a persisted bell notification. Dismissing it never marks it read. */
export default function DriverUpdatePopup({ item, onOpen, onRemove }: {
  item: AdminNotification;
  onOpen: (item: AdminNotification) => void;
  onRemove: (id: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [item.id]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onRemove(item.id), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, leaving, onRemove]);

  return <div role="status" aria-live="polite" className={`pointer-events-auto relative overflow-hidden rounded-xl shadow-[0_12px_32px_-12px_rgba(11,35,67,0.28)] ${leaving ? "driver-popup-out" : "driver-popup-in"}`}>
    <DriverUpdateCard item={item} timeLabel="Just now" onOpen={() => onOpen(item)} />
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1 bg-slate-100">
      <span className="driver-popup-countdown block h-full w-full origin-left" style={{ animationDuration: `${DISPLAY_MS}ms`, backgroundColor: driverUpdateColor(item) }} />
    </div>
  </div>;
}
