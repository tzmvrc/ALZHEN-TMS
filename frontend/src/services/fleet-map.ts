import { validPoint, type RoadTrip } from "./road-routing";

export function fleetStatus(row: RoadTrip, now = Date.now()) {
  const status = (row.tripStatus ?? "").toUpperCase().replaceAll("_", " ");
  if (["COMPLETED", "DELIVERED"].includes(status)) return { label: "Completed", color: "#16846c", symbol: "✓" };
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  if (status === "DELAYED" || status === "IN PROGRESS" && row.estimatedDeliveryDate && row.estimatedDeliveryDate.slice(0,10) < today)
    return { label: "Delayed / overdue", color: "#b94536", symbol: "!" };
  if (status === "PLANNED") return { label: "Planned", color: "#8c650e", symbol: "P" };
  return { label: status === "IN PROGRESS" ? "In Progress" : status || "Status unavailable", color: "#2678b9", symbol: "•" };
}

export function fleetTooltip(row: RoadTrip) {
  const location = (name: string) => row.demonstration ? name.replace(/^DEMO Fleet \d+ /, "").replace(/ (warehouse|receiving point)$/, "") : name;
  return [row.plateNumber ?? "Plate unavailable", location(row.warehouse.name) + " → " + location(row.stops.at(-1)?.name ?? "Destination unavailable"),
    "Driver: " + (row.driverName ?? "Unavailable"), "Dispatch: " + (row.dispatchNumber ?? "Unavailable"),
    "Status: " + fleetStatus(row).label,
    "GPS: " + (row.position?.simulated ? "Demo / Simulated" : "Recorded device location"),
    row.position ? "Captured: " + new Date(row.position.capturedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) + " PHT" : "No GPS position"].join("\n");
}

/** Assignment keys preserve convoy identity. Never collapse vehicles by physical trip ID. */
export function fleetViewport(rows: RoadTrip[], selected: string, mode: "overview" | "focus") {
  return mode === "overview" ? rows.filter(row => validPoint(row.position)) : rows.filter(row => row.key === selected);
}
