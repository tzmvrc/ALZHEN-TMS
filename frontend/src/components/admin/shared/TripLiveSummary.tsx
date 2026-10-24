import { cargoCapacity, cargoTotal } from "../../../services/cargo-planning";
import type { CargoLine, CargoTruck } from "../../../services/cargo-planning";

// Existing callers use this exact-decimal formatter for display only.
export function displayCargoTotal(values: string[]) {
  try { return cargoTotal(values); } catch { return "Check values"; }
}

export function TripSummaryBar({ stops, qty, cbm, trucks, capacity = "", label = "This trip" }: { stops: number; qty: string; cbm: string; trucks: number; capacity?: string; label?: string }) {
  const usage = cargoCapacity(capacity, [{ line_key: "summary", truck_id: "summary", quantity: "0", allocated_cbm: cbm }]);
  const known = Number(capacity) > 0 && usage.remaining !== "unknown" && usage.assigned !== "Check values";
  return <div className="trip-summary-bar" aria-label="Trip summary">
    <strong>{label}</strong><dl>{[["Stops", stops], ["Qty", qty], ["CBM", cbm], ["Trucks", trucks]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="trip-summary-capacity"><span>{known ? `${cbm} / ${capacity} CBM` : "Capacity not set"}</span><meter aria-label="Fleet capacity" min={0} max={known ? Number(capacity) : 1} value={known ? Math.min(Number(cbm), Number(capacity)) : 0} />{known && <span>{usage.exceeded ? "Over capacity" : usage.full ? "Full" : "Available"}</span>}</div>
  </div>;
}
type Props = { dispatch: string; tripNumber: string; tripType: string; status: string; loadingDate: string; etaDate: string; stops: number; lines: CargoLine[]; trucks: CargoTruck[]; mobile?: boolean; capacity?: string };
export default function TripLiveSummary({ stops, lines, trucks, capacity }: Props) {
  return <TripSummaryBar stops={stops} qty={displayCargoTotal(lines.map(line => line.quantity))} cbm={displayCargoTotal(lines.map(line => line.cbm))} trucks={trucks.length} capacity={capacity ?? displayCargoTotal(trucks.filter(truck => /^\d+(?:\.\d+)?$/.test(truck.capacity) && Number(truck.capacity) > 0).map(truck => truck.capacity))} />;
}
