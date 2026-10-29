import { useState } from "react";
import { CalendarDays, CarFront, LoaderCircle, Mail, Phone, Route, Truck, UserCircle2, X, Pencil, Plus } from "lucide-react";
import DriverTruckAssignmentForm from "./DriverTruckAssignmentForm";

function getInitials(name: string | null | undefined) {
  if (!name) return "T";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function resolveAvatarUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return null;
}

export default function TruckerDetailDrawer({
  trucker,
  loading = false,
  error,
  onClose,
  onEdit,
  canAssignTruck = false,
  onAssigned,
}: {
  trucker: {
    id: string;
    driver_id?: string;
    profile_id?: string;crew_role?:"DRIVER"|"HELPER";
    full_name: string;
    status: string | null;
    contact_number: string | null;
    email: string | null;
    profile_picture_path: string | null;
    truck: { plate_number: string | null; truck_number: string | null; make: string | null; model: string | null; status: string | null } | null;
    active_trip: { id?: string | null; trip_number: string | null; dispatch_number: string | null; status: string | null; loading_date: string | null; estimated_delivery_date: string | null; route: string | null; delivery_status: string | null; dr_number?: string | null } | null;
    trip_history: Array<{ id: string; trip_number: string | null; dispatch_number: string | null; status: string | null; loading_date: string | null; estimated_delivery_date: string | null; origin: string | null; destination: string | null; customer: string | null; store: string | null; delivery_status: string | null; plate_number: string | null; }>;
  } | null;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onEdit?: () => void;
  canAssignTruck?: boolean;
  onAssigned?: () => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState("");
  if (!trucker) return loading ? (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center p-0 sm:items-center sm:p-4 al-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingAssignment) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Loading trucker details" className="flex w-full max-w-sm flex-col items-center gap-3 rounded-t-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_24px_60px_rgba(11,35,65,0.28)] sm:rounded-2xl">
        <LoaderCircle aria-hidden="true" className="h-7 w-7 animate-spin text-[#2678b9]" />
        <p role="status" className="text-sm font-medium text-[#0b2341]">Loading trucker details…</p>
      </section>
    </div>
  ) : null;

  const avatar = resolveAvatarUrl(trucker.profile_picture_path);
  const recentTrips = trucker.trip_history.slice(0, 2);
  const statusLabel = trucker.status || "Inactive";

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center p-0 sm:items-center sm:p-4 al-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingAssignment) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Trucker details for ${trucker.full_name}`} className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(11,35,65,0.28)] sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#2678b9]">Trucker profile</p>
            <h2 className="mt-0.5 text-sm font-semibold text-[#0b2341]">Account, vehicle &amp; trip details</h2>
          </div>
          <button type="button" onClick={onClose} disabled={savingAssignment} aria-label="Close trucker details" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-[#0b2341] disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#0b2341] to-[#17436d] p-4 text-white sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-white/15 text-lg font-bold shadow-sm">
              {avatar ? <img src={avatar} alt={trucker.full_name} className="h-full w-full object-cover" /> : getInitials(trucker.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-bold tracking-tight sm:text-xl">{trucker.full_name}</h3>
              <p className="mt-0.5 text-xs text-white/65">Driver account</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusLabel.toLowerCase() === "active" ? "bg-emerald-300/15 text-emerald-100" : "bg-white/15 text-white/80"}`}>
              {statusLabel}
            </span>
          </div>

          {(onEdit || canAssignTruck) && <section aria-label="Driver actions" className="mt-3 rounded-2xl border border-slate-200 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-xs font-semibold text-[#0b2341]">Actions</h4><div className="flex flex-wrap gap-2">
              {onEdit && <button type="button" onClick={onEdit} disabled={savingAssignment} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-[#2678b9]"><Pencil className="h-3.5 w-3.5" />Edit driver</button>}
              {canAssignTruck && <button type="button" onClick={() => { setAssigning(value => !value); setAssignmentNotice(""); }} disabled={savingAssignment} aria-expanded={assigning} className="inline-flex items-center gap-2 rounded-full bg-[#ffd43b] px-3 py-2 text-xs font-semibold text-[#0b2341]"><Plus className="h-3.5 w-3.5" />Assign truck</button>}
            </div></div>
            {assignmentNotice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{assignmentNotice}</p>}
            {assigning && trucker.profile_id && <DriverTruckAssignmentForm profileId={trucker.profile_id} onCancel={() => setAssigning(false)} onBusyChange={setSavingAssignment} onSaved={() => { setAssignmentNotice("Truck crew updated."); onAssigned?.(); }} />}
          </section>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5">
              <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Contact</h4>
              <div className="space-y-2.5 text-[13px] text-slate-700">
                <div className="flex min-w-0 items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate">{trucker.contact_number || "Not provided"}</span></div>
                <div className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate">{trucker.email || "No email on file"}</span></div>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5">
              <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Assigned vehicle</h4>
              <div className="space-y-2.5 text-[13px] text-slate-700">
                <div className="flex min-w-0 items-center gap-2"><Truck className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate">{trucker.truck?.truck_number || trucker.truck?.plate_number || "Not assigned"}</span></div>
                <div className="flex min-w-0 items-center gap-2"><CarFront className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate">{trucker.truck?.plate_number || "Plate number unavailable"}</span></div>
                <div className="flex min-w-0 items-center gap-2"><UserCircle2 className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate">{trucker.truck?.make && trucker.truck?.model ? `${trucker.truck.make} ${trucker.truck.model}` : "Vehicle details unavailable"}</span></div>
              </div>
            </section>
          </div>

          <section className="mt-3 rounded-2xl border border-[#dbe7f3] bg-[#f5f9fd] p-3.5 sm:p-4">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Current assignment</h4>
              {trucker.active_trip?.delivery_status && <span className="rounded-full bg-[#e6f0f9] px-2.5 py-1 text-[10px] font-bold text-[#1d5f94]">{trucker.active_trip.delivery_status}</span>}
            </div>
            {trucker.active_trip ? (
              <div className="grid gap-x-5 gap-y-2 text-[12px] text-slate-700 sm:grid-cols-2">
                <div className="flex min-w-0 items-center gap-2"><Truck className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate font-semibold text-[#0b2341]">{trucker.active_trip.dispatch_number || trucker.active_trip.trip_number || "Trip not identified"}</span></div>
                <div className="min-w-0 text-xs"><span className="font-medium text-slate-500">Trip no.: </span><span>{trucker.active_trip.trip_number || "Not recorded"}</span></div>
                <div className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate">{trucker.active_trip.loading_date ? new Date(trucker.active_trip.loading_date).toLocaleDateString() : "Date unavailable"}</span></div>
                <div className="flex min-w-0 items-center gap-2 sm:col-span-2"><Route className="h-4 w-4 shrink-0 text-[#2678b9]" /><span className="truncate">{trucker.active_trip.route || "Route not available"}</span></div>
              </div>
            ) : <p className="text-xs text-slate-500">No active trip assigned.</p>}
          </section>

          <section className="mt-3 rounded-2xl border border-slate-200/80 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Recent delivery history</h4>
              {trucker.trip_history.length > recentTrips.length && <span className="text-[10px] font-medium text-slate-400">+{trucker.trip_history.length - recentTrips.length} more</span>}
            </div>
            {loading && <p role="status" className="mb-2 text-xs text-slate-500">Loading additional details…</p>}
            {error && <p role="alert" className="mb-2 text-xs text-rose-700">{error}</p>}
            {recentTrips.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {recentTrips.map((trip) => (
                  <article key={trip.id} className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-[#0b2341]">{trip.dispatch_number || trip.trip_number || "Trip"}</p>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">{trip.delivery_status || trip.status || "Unknown"}</span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-500">{trip.origin || "Origin"} → {trip.destination || "Destination"}</p>
                    <p className="mt-1 truncate text-[10px] text-slate-400">{trip.customer || "Customer unavailable"} · {trip.loading_date ? new Date(trip.loading_date).toLocaleDateString() : "Date unavailable"}</p>
                  </article>
                ))}
              </div>
            ) : !loading && !error && <p className="text-xs text-slate-500">No delivery history recorded.</p>}
          </section>
        </div>
      </section>
    </div>
  );
}
