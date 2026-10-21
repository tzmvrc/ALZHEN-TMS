import { useState } from "react";
import { fetchTrips, fetchTripStops, fetchTripAssignments } from "../../services/trip.service";
import { apiPost, invalidateApiCache, type ApiResponse } from "../../services/api.service";
import { invalidateReportPageCache, type ReportRow } from "../../services/report.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import type { RelationshipOption } from "../../services/lookup.service";

export default function TripRowContextDialog({ token, initial, action, onClose, onChosen }: { token: string; initial?: ReportRow; action: "parent" | "stop" | "assignment"; onClose: () => void; onChosen: (row: ReportRow) => void }) {
  const [trips, setTrips] = useState<ReportRow[]>(initial?.trip_id ? [{ ...initial, id: initial.trip_id }] : []);
  const [trip, setTrip] = useState(String(initial?.trip_id ?? ""));
  const [stops, setStops] = useState<ReportRow[]>([]);
  const [stop, setStop] = useState("");
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<RelationshipOption | null>(null), [store, setStore] = useState<RelationshipOption | null>(null);
  const [truck, setTruck] = useState<RelationshipOption | null>(null), [driver, setDriver] = useState<RelationshipOption | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const control = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  async function find() { setBusy(true); setError(""); try { setTrips((await fetchTrips(token, { limit: 100, search: query })).rows); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function loadStops() { if (!trip) return; setBusy(true); setError(""); try { const rows = await fetchTripStops(token, trip); setStops(rows); setStop(rows.length ? String(rows[0].id) : ""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function save() {
    setBusy(true); setError("");
    try {
      const parent = trips.find(row => row.id === trip) ?? { id: trip };
      if (action === "parent") {
        const selected = stops.find(row => row.id === stop); if (!selected) throw Error("Load and select a delivery stop.");
        onChosen({ ...parent, trip_id: trip, trip_stop_id: stop, customer_id: selected.customer_id, store_id: selected.store_id });
      } else if (action === "stop") {
        if (!customer) throw Error("Select the stop's customer.");
        invalidateApiCache(`/trips/${trip}/stops`);
        const current = await fetchTripStops(token, trip);
        const response = await apiPost<ApiResponse<ReportRow>>(`/trips/${trip}/stops`, { customer_id: customer.id, store_id: store?.id ?? null, stop_sequence: Math.max(0, ...current.map(row => Number(row.stop_sequence) || 0)) + 1, delivery_status: "PENDING" }, token);
        if (!response.success || !response.data) throw Error(response.message ?? "Stop creation was not confirmed.");
        onChosen({ ...parent, trip_id: trip, trip_stop_id: response.data.id, customer_name: customer.label, store_name: store?.label ?? "", customer_id: customer.id, store_id: store?.id ?? null });
      } else {
        if (!truck) throw Error("Select an actual truck / plate number.");
        invalidateApiCache(`/trips/${trip}/assignments`);
        const current = await fetchTripAssignments(token, trip);
        const response = await apiPost<ApiResponse<ReportRow>>(`/trips/${trip}/assignments`, { truck_id: truck.id, driver_id: driver?.id ?? null, assignment_type: current.some(row => row.assignment_type === "PRIMARY" && !row.unassigned_at) ? "ADDITIONAL" : "PRIMARY" }, token);
        if (!response.success || !response.data) throw Error(response.message ?? "Truck assignment was not confirmed.");
        onChosen({ ...parent, trip_id: trip });
      }
      invalidateApiCache("/trips"); invalidateApiCache("/reports"); invalidateReportPageCache(); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const relationship = (kind: "customers" | "stores" | "trucks" | "drivers", selected: RelationshipOption | null, choose: (value: RelationshipOption) => void) => <div className={control}><SearchableRelationshipEditor token={token} kind={kind} value={selected?.label ?? ""} customerId={kind === "stores" ? customer?.id : undefined} disabled={busy} autoFocus={false} onSelect={choose} onCommitBlur={() => {}} onCancel={() => {}} /></div>;
  return <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-900/30 p-4"><section role="dialog" aria-modal="true" aria-label={action === "parent" ? "Choose product row parent" : action === "stop" ? "Add stop" : "Add truck assignment"} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-2xl bg-white p-5 shadow-xl">
    <h2 className="font-semibold text-[#0b2341]">{action === "parent" ? "Choose trip and delivery stop" : action === "stop" ? "Add delivery stop" : "Add truck assignment"}</h2>
    <div className="flex gap-2"><input aria-label="Find parent trip" value={query} onChange={e => setQuery(e.target.value)} className={control} placeholder="Dispatch or trip number" /><button type="button" disabled={busy} onClick={() => void find()}>Find</button></div>
    <select aria-label="Parent trip" className={control} disabled={busy} value={trip} onChange={e => { setTrip(e.target.value); setStops([]); setStop(""); }}><option value="">Select trip</option>{trips.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.dispatch_number ?? "Trip")} / {String(row.trip_reference ?? row.trip_number ?? row.id)}</option>)}</select>
    {action === "parent" && <><button type="button" disabled={busy || !trip} className="text-sm text-blue-700" onClick={() => void loadStops()}>Load delivery stops</button><select aria-label="Delivery stop" className={control} disabled={busy} value={stop} onChange={e => setStop(e.target.value)}><option value="">Select stop</option>{stops.map(row => <option key={String(row.id)} value={String(row.id)}>Stop {String(row.stop_sequence)} · {String(row.store_name ?? row.store_id ?? row.customer_id)}</option>)}</select></>}
    {action === "stop" && <><label className="block text-xs">Customer{relationship("customers", customer, option => { setCustomer(option); setStore(null); })}</label><label className="block text-xs">Destination (optional){relationship("stores", store, setStore)}</label></>}
    {action === "assignment" && <><label className="block text-xs">Assigned truck / plate{relationship("trucks", truck, setTruck)}</label><label className="block text-xs">Driver (optional){relationship("drivers", driver, setDriver)}</label><p className="text-xs text-slate-500">Cargo is not allocated automatically. Use Trip details → Truck allocation to choose which product quantities belong on this truck.</p></>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" disabled={busy || !trip} onClick={() => void save()} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-medium">{busy ? "Saving…" : action === "parent" ? "Use this stop" : "Save"}</button></div>
  </section></div>;
}
