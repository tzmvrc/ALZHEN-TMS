import { ArrowRight, Check, FileText, MapPin, Package, PackageCheck, PackageOpen, TriangleAlert, Truck, Warehouse, X } from "lucide-react";
import type { AdminNotification } from "../../services/notification.service";
import { activityDescription } from "../../services/activity-presentation";
import { TRACKER_STAGES } from "../../services/live-activity.service";

const stageForEvent = (eventType: string) => {
  const type = eventType.toUpperCase();
  if (/INCIDENT|DELAY|BREAKDOWN|BACKLOAD|OFFLOAD|TRAFFIC|ERROR|REFUS|RETURN|CUSTOM_STATUS/.test(type)) return -1;
  if (/UNLOADING_FINISHED|ASSIGNMENT_COMPLETED|DELIVER|POD|RECEIPT/.test(type)) return 5;
  if (/UNLOADING_STARTED|PARTIAL_UNLOAD/.test(type)) return 4;
  if (/STORE_ARRIVAL|ARRIVED/.test(type) && !/WAREHOUSE/.test(type)) return 3;
  if (/WAREHOUSE_DEPARTURE|IN_TRANSIT|STOP_DEPARTURE/.test(type)) return 2;
  if (/LOADING_STARTED|LOADING_FINISHED/.test(type)) return 1;
  if (/WAREHOUSE_ARRIVAL/.test(type)) return 0;
  return -1;
};

const colorForStage = (stage: number) =>
  ["#64748b", "#0ea5e9", "#2678b9", "#7c3aed", "#ea580c", "#059669"][stage] ?? "#dc2626";

export default function DriverUpdateToast({
  item,
  onOpen,
  onDismiss,
}: {
  item: AdminNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const eventType = String(item.metadata.event_type ?? "");
  const stage = stageForEvent(eventType);
  const color = colorForStage(stage);
  const Icon = stage < 0 ? TriangleAlert
    : stage === 0 ? Warehouse
    : stage === 1 ? /FINISHED/.test(eventType.toUpperCase()) ? Package : PackageOpen
    : stage === 2 ? Truck
    : stage === 3 ? MapPin
    : stage === 4 ? PackageOpen
    : /POD|RECEIPT/.test(eventType.toUpperCase()) ? FileText : PackageCheck;
  const dispatch = String(item.metadata.dispatch_number ?? "Trip");
  const driver = String(item.metadata.driver_name ?? "Driver");
  const title = activityDescription(eventType).replace(" at warehouse", "");

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 top-20 z-[90] flex w-[min(25rem,calc(100vw-2rem))] flex-col items-end gap-2">
      <style>{`@keyframes driver-update-toast-drain { from { width: 100%; } to { width: 0%; } } @media (prefers-reduced-motion: reduce) { .driver-update-toast-drain { animation: none !important; } }`}</style>
      <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#0b2341] px-3 py-1.5 text-[11px] font-semibold text-white shadow-md">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
        Live from drivers
      </span>
      <section aria-label={`Driver update for ${dispatch}`} className="pointer-events-auto relative w-full overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_-8px_rgba(11,35,65,0.35)] ring-1 ring-slate-900/10">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />
        <div className="p-4 pl-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: color }}>
              <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>{dispatch}</p>
              <h2 className="text-[15px] font-bold leading-snug text-[#0b2341]">{title}</h2>
              <p className="mt-0.5 truncate text-xs text-slate-500">{driver}</p>
            </div>
            <button type="button" onClick={onDismiss} aria-label="Dismiss driver update" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2678b9]">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {stage >= 0 && (
            <ol aria-label="Trip progress" className="mt-4 flex items-start">
              {TRACKER_STAGES.map((step, index) => (
                <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center">
                  {index > 0 && <span aria-hidden="true" className="absolute right-1/2 top-[9px] h-0.5 w-full -translate-y-1/2 bg-slate-200"><span className="block h-full" style={{ backgroundColor: color, width: index <= stage ? "100%" : "0%" }} /></span>}
                  <span className="relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 bg-white" style={{ borderColor: index <= stage ? color : "#e2e8f0", backgroundColor: index < stage ? color : "#fff" }}>
                    {index < stage ? <Check aria-hidden="true" className="h-2.5 w-2.5 text-white" strokeWidth={4} /> : index === stage ? <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> : null}
                  </span>
                  <span className="mt-1 max-w-full truncate text-[9px] leading-tight" style={{ color: index === stage ? color : "#94a3b8", fontWeight: index === stage ? 700 : 500 }}>{step.label}</span>
                </li>
              ))}
            </ol>
          )}
          <button type="button" onClick={onOpen} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2678b9]" style={{ backgroundColor: color }}>
            View trip <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100">
          <span className="driver-update-toast-drain block h-full" style={{ backgroundColor: color, animation: "driver-update-toast-drain 7s linear forwards" }} />
        </span>
      </section>
    </div>
  );
}
