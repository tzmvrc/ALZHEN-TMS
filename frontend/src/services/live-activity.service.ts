/* Turns raw realtime row changes (trucker updates) into plain "what just happened"
   activities that staff can notice. Pure logic only: no React, no network. */

export type ActivityStage =
  | "warehouse"
  | "loading"
  | "loaded"
  | "route"
  | "arrived"
  | "unloading"
  | "delivered"
  | "receipt"
  | "alert";

export type RawActivity = {
  /** Same key = same moment in the trip; a repeat updates the card instead of stacking a new one. */
  dedupeKey: string;
  tripId: string;
  stopId: string | null;
  stage: ActivityStage;
  title: string;
  detail?: string;
  /** Stays on screen until staff dismiss it (problems, things that need a human). */
  sticky?: boolean;
  drNumber?: string | null;
};

/* The journey shown as the progress strip on each alert. */
export const TRACKER_STAGES = [
  { key: "warehouse", label: "Warehouse" },
  { key: "loading", label: "Loading" },
  { key: "route", label: "On route" },
  { key: "arrived", label: "Arrived" },
  { key: "unloading", label: "Unloading" },
  { key: "delivered", label: "Delivered" },
] as const;

/** Position on the strip, or -1 when the stage is not part of the journey (alerts). */
export function trackerIndex(stage: ActivityStage): number {
  switch (stage) {
    case "warehouse": return 0;
    case "loading":
    case "loaded": return 1;
    case "route": return 2;
    case "arrived": return 3;
    case "unloading": return 4;
    case "delivered":
    case "receipt": return 5;
    default: return -1;
  }
}

/* Tables whose rows hold a delivery receipt photo or its text. Adjust to match the
   backend if receipts live in a differently named table. */
export const RECEIPT_TABLES = ["trip_images"] as const;

export const WATCHED_TABLES = [
  "trips",
  "trip_stops",
  "trip_events",
  "driver_trip_updates",
  "loading_reports",
  "unloading_reports",
  ...RECEIPT_TABLES,
] as const;

type Row = Record<string, unknown>;

const FRESH_MS = 5 * 60_000;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function isFresh(value: unknown, now: number, windowMs = FRESH_MS) {
  const raw = text(value);
  if (!raw) return false;
  const time = Date.parse(raw);
  return Number.isFinite(time) && Math.abs(now - time) < windowMs;
}

const ALERT_STATUS = /DELAY|ERROR|FAIL|EXCEPTION|INCIDENT|BREAKDOWN|REFUS|RETURN/i;
const CANCEL_STATUS = /CANCEL|VOID/i;

const LOADING_FIELDS = [
  ["loading_finished_at", "loaded", "Loading complete", "The truck is loaded and ready to leave."],
  ["loading_start_at", "loading", "Loading started", "Warehouse staff are loading the truck."],
  ["warehouse_arrival_at", "warehouse", "Arrived at the warehouse", "The truck is at the warehouse."],
] as const;

const UNLOADING_FIELDS = [
  ["finish_unloading_time", "delivered", "Unloading finished", "The delivery is complete."],
  ["start_unloading_time", "unloading", "Unloading started", "The driver is unloading at the stop."],
  ["arrival_time", "arrived", "Arrived at the delivery stop", "The truck reached the store."],
] as const;

/**
 * @param memory  Per-session scratch map owned by the caller. It remembers which updates were
 *                already announced and each row's last status, so a repeat or an unrelated
 *                admin edit does not raise a second alert.
 */
export function deriveActivities(
  table: string,
  row: Row,
  isInsert: boolean,
  memory: Map<string, string>,
  now = Date.now(),
  before?: Row | null,
): RawActivity[] {
  const tripId = table === "trips" ? text(row.id) : text(row.trip_id);
  if (!tripId) return [];
  if (row.archived_at) return [];
  const out: RawActivity[] = [];
  const once = (key: string) => {
    if (memory.has(key)) return false;
    memory.set(key, "1");
    return true;
  };
  const push = (
    stage: ActivityStage,
    title: string,
    options: { stopId?: string | null; detail?: string; sticky?: boolean; drNumber?: string | null } = {},
  ) => {
    const stopId = options.stopId ?? null;
    out.push({
      dedupeKey: `${tripId}:${stopId ?? ""}:${stage}`,
      tripId,
      stopId,
      stage,
      title,
      detail: options.detail,
      sticky: options.sticky,
      drNumber: options.drNumber,
    });
  };

  /* A status that changed since we last saw this row. A row we have never seen counts as
     changed only if it was written in the last half minute. */
  const statusChanged = (key: string, status: string | null) => {
    if (!status) return false;
    const previous = memory.get(key);
    memory.set(key, status);
    const field = table === "trips" ? "status" : "delivery_status";
    if (before && before[field] === status) return false;
    return previous === undefined ? isFresh(row.updated_at, now, 30_000) : previous !== status;
  };

  switch (table) {
    case "loading_reports": {
      for (const [field, stage, title, detail] of LOADING_FIELDS) {
        if (isFresh(row[field], now)) {
          if ((!before || before[field] !== row[field]) && once(`${table}:${row.id}:${field}:${row[field]}`)) push(stage, title, { detail });
          break;
        }
      }
      break;
    }
    case "unloading_reports": {
      const stopId = text(row.trip_stop_id);
      for (const [field, stage, title, detail] of UNLOADING_FIELDS) {
        if (isFresh(row[field], now)) {
          if ((!before || before[field] !== row[field]) && once(`${table}:${row.id}:${field}:${row[field]}`)) push(stage, title, { stopId, detail });
          break;
        }
      }
      break;
    }
    case "trips": {
      if ((!before || before.departure_from_warehouse_at !== row.departure_from_warehouse_at) && isFresh(row.departure_from_warehouse_at, now) && once(`trip-left:${tripId}:${row.departure_from_warehouse_at}`)) {
        push("route", "Trip started", { detail: "The truck left the warehouse." });
      }
      const status = text(row.status);
      if (statusChanged(`trip-status:${tripId}`, status) && status) {
        if (CANCEL_STATUS.test(status)) push("alert", "Trip cancelled", { sticky: true });
        else if (ALERT_STATUS.test(status)) push("alert", "Trip needs attention", { detail: status.replaceAll("_", " ").toLowerCase(), sticky: true });
        else if (/COMPLET/i.test(status)) push("delivered", "Trip completed");
      }
      break;
    }
    case "trip_stops": {
      const stopId = text(row.id);
      for (const [field, stage, title, detail] of UNLOADING_FIELDS) {
        if (isFresh(row[field], now)) {
          if ((!before || before[field] !== row[field]) && once(`${table}:${row.id}:${field}:${row[field]}`)) push(stage, title, { stopId, detail });
          break;
        }
      }
      const status = text(row.delivery_status);
      if (stopId && statusChanged(`stop-status:${stopId}`, status) && status) {
        if (ALERT_STATUS.test(status)) push("alert", "Delivery problem", { stopId, detail: status.replaceAll("_", " ").toLowerCase(), sticky: true });
        else if (/DELIVER|COMPLET/i.test(status) && !out.some((activity) => activity.stage === "delivered")) push("delivered", "Delivery completed", { stopId });
      }
      break;
    }
    case "trip_events": {
      if (!isInsert) break;
      const type = String(row.event_type ?? "").toUpperCase();
      const notes = text(row.notes);
      const stopId = text(row.trip_stop_id);
      const milestones:Record<string,[ActivityStage,string]>={WAREHOUSE_ARRIVAL:['warehouse','Arrived at warehouse'],LOADING_STARTED:['loading','Started loading'],LOADING_FINISHED:['loaded','Finished loading'],WAREHOUSE_DEPARTURE:['route','Departed warehouse'],IN_TRANSIT:['route','In transit'],ARRIVED:['arrived','Arrived at delivery stop'],UNLOADING_STARTED:['unloading','Started unloading'],PARTIAL_UNLOAD:['unloading','Cargo quantities updated'],UNLOADING_FINISHED:['unloading','Finished unloading'],STOP_DEPARTURE:['route','Departed delivery stop'],ASSIGNMENT_COMPLETED:['delivered','Assigned delivery completed'],POD_SUBMITTED:['receipt','POD submitted'],PHOTO_UPLOADED:['receipt','Delivery photo submitted'],BACKLOAD_REPORTED:['alert','Backload reported'],OFFLOAD_REPORTED:['alert','Offload reported'],CUSTOM_STATUS:['alert','Driver update']};
      const milestone=milestones[type];
      if(milestone){
        const metadata=row.delivery_metadata as {title?:unknown}|undefined;
        const title=type==='CUSTOM_STATUS'&&typeof metadata?.title==='string'?metadata.title:milestone[1];
        if(once(`delivery-event:${row.id}`))push(milestone[0],title,{stopId,detail:notes??undefined,sticky:milestone[0]==='alert'});
        break;
      }
      if (/DELAY|INCIDENT|BREAKDOWN|ERROR|EXCEPTION/.test(type)) {
        push("alert", type.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), { stopId, detail: notes ?? undefined, sticky: true });
      } else if (type === "STORE_ARRIVAL") {
        push("arrived", "Arrived at the delivery stop", { stopId, detail: notes ?? undefined });
      } else if (notes && /^(on route|en route)/i.test(notes)) {
        push("route", "On the road", { stopId, detail: notes });
      }
      break;
    }
    case "driver_trip_updates": {
      const status = text(row.status) ?? text(row.delivery_status);
      if (!status || !isFresh(row.updated_at, now, 7 * 24 * 60 * 60_000)) break;
      const stage: ActivityStage = ALERT_STATUS.test(status) ? "alert"
        : /DELIVER|COMPLET/i.test(status) ? "delivered"
        : /ARRIV/i.test(status) ? "arrived"
        : /LOAD/i.test(status) ? "loading" : "route";
      const title = status.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
      if (once(`driver-update:${row.id}:${row.updated_at}`)) {
        push(stage, title, { detail: text(row.notes) ?? undefined, sticky: stage === "alert" });
      }
      break;
    }
    default: {
      if (!(RECEIPT_TABLES as readonly string[]).includes(table)) break;
      const stopId = text(row.trip_stop_id);
      const drNumber = text(row.dr_number);
      /* Admin gallery uploads are also trip_images rows; only count driver receipts. */
      if (row.kind !== "receipt") break;
      const detail = drNumber ? `DR ${drNumber}` : undefined;
      if (isInsert && once(`receipt-new:${row.id}`)) {
        push("receipt", "Delivery receipt received", { stopId, detail, drNumber });
      }
      if (text(row.ocr_text) && !text(row.reviewed_at) && once(`receipt-text:${row.id}`)) {
        push("receipt", "Receipt text ready to review", { stopId, detail, drNumber, sticky: true });
      }
    }
  }
  return out;
}
