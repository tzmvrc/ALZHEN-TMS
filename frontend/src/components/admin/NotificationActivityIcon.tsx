import { Bell, FileText, MapPin, Package, PackageOpen, Truck, TriangleAlert, Warehouse } from "lucide-react";
import type { AdminNotification } from "../../services/notification.service";

/** The journey icon used by driver updates, displayed within the shared notification lists. */
export default function NotificationActivityIcon({ item }: { item: AdminNotification }) {
  if (item.metadata?.event_kind !== "driver_update") {
    return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[#2678b9]"><Bell aria-hidden="true" className="h-4 w-4" /></span>;
  }

  const type = String(item.metadata.event_type ?? "").toUpperCase();
  const [Icon, color] = /INCIDENT|DELAY|BREAKDOWN|BACKLOAD|OFFLOAD|TRAFFIC|ERROR|REFUS|RETURN|CUSTOM_STATUS/.test(type)
    ? [TriangleAlert, "#dc2626"] as const
    : /POD|PHOTO|RECEIPT/.test(type) ? [FileText, "#0d9488"] as const
    : /UNLOAD/.test(type) ? [PackageOpen, "#ea580c"] as const
    : /DELIVER|COMPLET/.test(type) ? [Package, "#059669"] as const
    : /ARRIV/.test(type) && !/WAREHOUSE/.test(type) ? [MapPin, "#7c3aed"] as const
    : /LOAD/.test(type) ? [PackageOpen, "#d97706"] as const
    : /WAREHOUSE/.test(type) ? [Warehouse, "#64748b"] as const
    : [Truck, "#2678b9"] as const;

  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: color }}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span>;
}
