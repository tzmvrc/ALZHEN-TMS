import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { invalidateApiCache } from "../../services/api.service";
import { searchRelationshipOptions, type RelationshipOption } from "../../services/lookup.service";
import { createTripAssignmentRecord, fetchTripAssignments, fetchTrips, updateTripAssignmentRecord, type TripRecord } from "../../services/trip.service";
import TripFormNotice from "./TripFormNotice";

const field = "h-10 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400";
const activeTrip = (trip: TripRecord) => !/^(DELIVERED|COMPLETED|CANCELLED|CANCELED|CLOSED|FINISHED|ARCHIVED|REJECTED)$/i.test(String(trip.status ?? ""));

export default function DriverTruckAssignmentForm({ driverId, initialTrip, onCancel, onSaved, onBusyChange }: {
  driverId: string; initialTrip?: TripRecord | null; onCancel: () => void; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const { accessToken } = useAuth();
  const [trips, setTrips] = useState<TripRecord[]>(initialTrip ? [initialTrip] : []);
  const [trucks, setTrucks] = useState<RelationshipOption[]>([]);
  const [tripId, setTripId] = useState(initialTrip?.id ?? "");
  const [truckId, setTruckId] = useState("");
  const [tripSearch, setTripSearch] = useState("");
  const [truckSearch, setTruckSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void Promise.all([fetchTrips(accessToken, { limit: 100, archiveScope: "active" }), searchRelationshipOptions(accessToken, "trucks", "")]).then(([page, options]) => {
      if (active) { setTrips([...new Map([...(initialTrip ? [initialTrip] : []), ...page.rows.filter(activeTrip)].map(trip => [trip.id, trip])).values()]); setTrucks(options); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load assignment options."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, initialTrip]);

  async function search(kind: "trip" | "truck") {
    if (!accessToken) return;
    setLoading(true); setError("");
    try {
      if (kind === "trip") {
        const page = await fetchTrips(accessToken, { limit: 100, archiveScope: "active", search: tripSearch });
        setTrips(current => [...new Map([...current.filter(trip => trip.id === tripId), ...page.rows.filter(activeTrip)].map(trip => [trip.id, trip])).values()]);
      } else {
        const options = await searchRelationshipOptions(accessToken, "trucks", truckSearch);
        setTrucks(current => [...new Map([...current.filter(truck => truck.id === truckId), ...options].map(truck => [truck.id, truck])).values()]);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed. Please try again."); }
    finally { setLoading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || saving || loading) return;
    if (!tripId || !truckId) { setError("Choose a trip and a truck."); return; }
    setSaving(true); onBusyChange(true); setError("");
    try {
      invalidateApiCache(`/trips/${encodeURIComponent(tripId)}/assignments`);
      const assignments = (await fetchTripAssignments(accessToken, tripId)).filter(assignment => !assignment.unassigned_at);
      const existing = assignments.find(assignment => assignment.truck_id === truckId);
      if (existing?.driver_id && existing.driver_id !== driverId) throw new Error("This truck already has another driver on the selected trip. Choose a different truck.");
      if (existing) {
        if (existing.driver_id !== driverId) await updateTripAssignmentRecord(accessToken, tripId, existing.id, { driver_id: driverId });
      } else {
        await createTripAssignmentRecord(accessToken, tripId, { truck_id: truckId, driver_id: driverId, assignment_type: assignments.some(assignment => assignment.assignment_type === "PRIMARY") ? "ADDITIONAL" : "PRIMARY" });
      }
      invalidateApiCache("/truckers"); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to assign truck."); }
    finally { setSaving(false); onBusyChange(false); }
  }

  return <form onSubmit={event => void submit(event)} className="mt-3 space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
    <div><h5 className="text-sm font-semibold text-[#0b2341]">Assign truck</h5><p className="mt-1 text-xs text-slate-500">Choose the trip and vehicle for this driver.</p></div>
    <fieldset disabled={saving || loading} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-2"><label className="block text-xs font-medium text-slate-600">Find trip<div className="mt-1 flex gap-1"><input aria-label="Search assignment trips" value={tripSearch} onChange={event => setTripSearch(event.target.value)} placeholder="Dispatch or trip number" className={field} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search("trip"); } }} /><button type="button" aria-label="Search trips" onClick={() => void search("trip")} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3"><Search className="h-4 w-4" /></button></div></label><label className="block text-xs font-medium text-slate-600">Trip<select aria-label="Assignment trip" required value={tripId} onChange={event => setTripId(event.target.value)} className={`${field} mt-1`}><option value="">Select a trip</option>{trips.map(trip => <option key={trip.id} value={trip.id}>{String(trip.dispatch_number || "No dispatch")} · {trip.trip_reference || `Trip ${String(trip.trip_number ?? "—")}`}</option>)}</select></label></div>
      <div className="min-w-0 space-y-2"><label className="block text-xs font-medium text-slate-600">Find truck<div className="mt-1 flex gap-1"><input aria-label="Search assignment trucks" value={truckSearch} onChange={event => setTruckSearch(event.target.value)} placeholder="Plate number" className={field} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search("truck"); } }} /><button type="button" aria-label="Search trucks" onClick={() => void search("truck")} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3"><Search className="h-4 w-4" /></button></div></label><label className="block text-xs font-medium text-slate-600">Truck<select aria-label="Assignment truck" required value={truckId} onChange={event => setTruckId(event.target.value)} className={`${field} mt-1`}><option value="">Select a truck</option>{trucks.map(truck => <option key={truck.id} value={truck.id}>{truck.label}{truck.secondary ? ` · ${truck.secondary}` : ""}</option>)}</select></label></div>
    </fieldset>
    {loading && <p role="status" className="text-xs text-slate-500">Loading trips and trucks…</p>}
    {error && <TripFormNotice tone="error" title="Truck assignment needs attention">{error}</TripFormNotice>}
    <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onCancel} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600">Cancel</button><button disabled={saving || loading || !tripId || !truckId} className="inline-flex items-center gap-2 rounded-full bg-[#ffd43b] px-4 py-2 text-xs font-semibold text-[#0b2341] disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{saving ? "Assigning…" : "Save assignment"}</button></div>
  </form>;
}
