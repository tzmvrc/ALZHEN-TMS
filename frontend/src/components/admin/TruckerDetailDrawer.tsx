import { CalendarDays, CarFront, MapPinned, Mail, Phone, Route, Truck, UserCircle2, X } from "lucide-react";

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
  onClose,
}: {
  trucker: {
    id: string;
    full_name: string;
    status: string | null;
    contact_number: string | null;
    email: string | null;
    profile_picture_path: string | null;
    truck: { plate_number: string | null; truck_number: string | null; make: string | null; model: string | null; status: string | null } | null;
    active_trip: { trip_number: string | null; dispatch_number: string | null; status: string | null; loading_date: string | null; estimated_delivery_date: string | null; route: string | null; delivery_status: string | null } | null;
    trip_history: Array<{ id: string; trip_number: string | null; dispatch_number: string | null; status: string | null; loading_date: string | null; estimated_delivery_date: string | null; origin: string | null; destination: string | null; customer: string | null; store: string | null; delivery_status: string | null; plate_number: string | null; }>;
  } | null;
  onClose: () => void;
}) {
  if (!trucker) return null;

  const avatar = resolveAvatarUrl(trucker.profile_picture_path);

  return (
    <aside className="fixed right-4 top-4 z-40 h-[calc(100vh-2rem)] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close trucker details"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
            <span>Truckers</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-5 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
              {avatar ? (
                <img src={avatar} alt={trucker.full_name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-slate-700">{getInitials(trucker.full_name)}</span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold text-slate-900">{trucker.full_name}</h3>
              <p className="mt-1 text-sm text-slate-600">{trucker.status || "Inactive"}</p>
            </div>
          </div>

          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Contact</h4>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-500" />
                  <span>{trucker.contact_number || "Not provided"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <span>{trucker.email || "No email on file"}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Vehicle</h4>
              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-slate-500" /> <span>{trucker.truck?.truck_number || trucker.truck?.plate_number || "Not assigned"}</span></div>
                <div className="flex items-center gap-2"><CarFront className="h-4 w-4 text-slate-500" /> <span>{trucker.truck?.plate_number || "Plate number not available"}</span></div>
                <div className="flex items-center gap-2"><UserCircle2 className="h-4 w-4 text-slate-500" /> <span>{trucker.truck?.make && trucker.truck?.model ? `${trucker.truck.make} ${trucker.truck.model}` : "Vehicle details unavailable"}</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Current assignment</h4>
              {trucker.active_trip ? (
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2"><span className="font-medium text-slate-900">Trip</span><span>{trucker.active_trip.trip_number || trucker.active_trip.dispatch_number || "Not assigned"}</span></div>
                  <div className="flex items-center gap-2"><Route className="h-4 w-4 text-slate-500" /> <span>{trucker.active_trip.route || "Route not available"}</span></div>
                  <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-500" /> <span>{trucker.active_trip.loading_date ? new Date(trucker.active_trip.loading_date).toLocaleDateString() : "Date unavailable"}</span></div>
                  <div className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-slate-500" /> <span>{trucker.active_trip.delivery_status || "Status unavailable"}</span></div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No active trip assigned.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery history</h4>
              {trucker.trip_history.length ? (
                <div className="space-y-3">
                  {trucker.trip_history.map((trip) => (
                    <div key={trip.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{trip.trip_number || trip.dispatch_number || "Trip"}</p>
                          <p className="mt-1 text-xs text-slate-500">{trip.origin || "Origin"} → {trip.destination || "Destination"}</p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">{trip.delivery_status || trip.status || "Unknown"}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <p>Customer: {trip.customer || "N/A"}</p>
                        <p>Store: {trip.store || "N/A"}</p>
                        <p>Truck: {trip.plate_number || "N/A"}</p>
                        <p>Loading: {trip.loading_date ? new Date(trip.loading_date).toLocaleString() : "N/A"}</p>
                        <p>ETA: {trip.estimated_delivery_date ? new Date(trip.estimated_delivery_date).toLocaleString() : "N/A"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No delivery history</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
