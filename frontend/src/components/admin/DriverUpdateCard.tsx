import { ArrowRight, Check, FileText, MapPin, Package, PackageCheck, PackageOpen, TriangleAlert, Truck, Warehouse } from "lucide-react";
import type { AdminNotification } from "../../services/notification.service";
import { activityDescription } from "../../services/activity-presentation";
import { TRACKER_STAGES } from "../../services/live-activity.service";

const stageForEvent = (eventType: string) => {
  const type = eventType.toUpperCase();
  if (/INCIDENT|ACCIDENT|DELAY|BREAKDOWN|BACKLOAD|OFFLOAD|TRAFFIC|ERROR|REFUS|RETURN|CUSTOM_STATUS/.test(type)) return -1;
  if (/UNLOADING_FINISHED|ASSIGNMENT_COMPLETED|DELIVER|POD|RECEIPT/.test(type)) return 5;
  if (/UNLOADING_STARTED|PARTIAL_UNLOAD/.test(type)) return 4;
  if (/STORE_ARRIVAL|ARRIVED/.test(type) && !/WAREHOUSE/.test(type)) return 3;
  if (/WAREHOUSE_DEPARTURE|IN_TRANSIT|ON_ROUTE|ON_THE_WAY|STOP_DEPARTURE/.test(type)) return 2;
  if (/LOADING_STARTED|LOADING_FINISHED/.test(type)) return 1;
  if (/WAREHOUSE_ARRIVAL/.test(type)) return 0;
  return -1;
};

const colorForStage = (stage: number) =>
  ["#64748b", "#0ea5e9", "#2678b9", "#7c3aed", "#ea580c", "#059669"][stage] ?? "#dc2626";

/** The same event-specific card used for live driver updates, sized for the bell panel. */
export default function DriverUpdateCard({
  item,
  onOpen,
  timeLabel,
}: {
  item: AdminNotification;
  onOpen: () => void;
  timeLabel: string;
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
  const plate = typeof item.metadata.plate_number === "string" ? item.metadata.plate_number : "";
  const title = eventType.toUpperCase() === "CUSTOM_STATUS"
    ? item.message.split(" · ").at(-1) || activityDescription(eventType)
    : activityDescription(eventType).replace(" at warehouse", "");

  return (
    <section aria-label={`Driver update for ${dispatch}`} className={`relative min-w-0 overflow-hidden rounded-xl border border-[#e4e9f0] bg-white ${item.read_at ? "opacity-80" : "shadow-sm"}`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
      <div className="px-3 py-3 pl-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: color }}>
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide" style={{ color }} title={dispatch}>{dispatch}</span>
              {!item.read_at && <span aria-label="Unread" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b2343]" />}
            </div>
            <h3 className="truncate text-[13px] font-semibold leading-5 text-[#0b2343]" title={title}>{title}</h3>
            <p className="truncate text-[11px] text-slate-500" title={[driver, plate].filter(Boolean).join(" · ")}>{driver}{plate ? ` · ${plate}` : ""}</p>
          </div>
          <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()} className="shrink-0 text-[10px] text-slate-400">{timeLabel}</time>
        </div>
        {stage >= 0 && (
          <ol aria-label="Trip progress" className="mt-3 flex items-start">
            {TRACKER_STAGES.map((step, index) => (
              <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center">
                {index > 0 && <span aria-hidden="true" className="absolute right-1/2 top-[7px] h-0.5 w-full -translate-y-1/2 bg-slate-200"><span className="block h-full" style={{ backgroundColor: color, width: index <= stage ? "100%" : "0%" }} /></span>}
                <span className="relative z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px] bg-white" style={{ borderColor: index <= stage ? color : "#e2e8f0", backgroundColor: index < stage ? color : "#fff" }}>
                  {index < stage ? <Check aria-hidden="true" className="h-2 w-2 text-white" strokeWidth={4} /> : index === stage ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
                </span>
                <span className="mt-1 max-w-full truncate text-[8px] leading-tight" style={{ color: index === stage ? color : "#94a3b8", fontWeight: index === stage ? 700 : 500 }}>{step.label}</span>
              </li>
            ))}
          </ol>
        )}
        <button type="button" onClick={onOpen} className="mt-2.5 inline-flex h-7 items-center gap-1 rounded-full px-3 text-[11px] font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b2343]" style={{ backgroundColor: color }}>
          View trip <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}
