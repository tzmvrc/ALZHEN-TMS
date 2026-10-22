import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { DestinationSource, LocationDecision } from "./ImportDestinationReview";

export default function ImportLocationNotices({ destinations, decisions, checking }: { destinations: DestinationSource[]; decisions: Record<string, LocationDecision>; checking: boolean }) {
  if (!destinations.length) return null;
  const lookups = destinations.flatMap(source => {
    if (!source.province.trim()) return [{ key: source.key, status: "missing_province", message: `Cannot find exact location for Ship To ${source.shipTo} - Province is missing.` }];
    const lookup = decisions[source.key]?.lookup;
    return lookup ? [{ key: source.key, ...lookup }] : [];
  });
  return <section aria-label="Delivery location notifications" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div><h3 className="text-sm font-semibold text-[#0b2341]">Delivery location checks</h3><p className="mt-1 text-xs text-slate-500">Matches are saved as unverified coordinates until an admin confirms them. Warehouse codes are saved without guessed addresses or map pins.</p></div>
    {checking && <p role="status" className="flex items-center gap-2 text-xs text-slate-600"><Loader2 size={14} className="animate-spin" />Checking delivery locations. You can complete other trip details while this runs.</p>}
    <div className="max-h-64 space-y-2 overflow-y-auto">{lookups.map(lookup => <p key={lookup.key} role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${lookup.status === "found" ? "border-blue-100 bg-blue-50 text-blue-900" : "border-amber-100 bg-amber-50 text-amber-900"}`}>{lookup.status === "found" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}<span>{lookup.message}</span></p>)}</div>
    {Object.values(decisions).some(decision => ["geoapify", "store"].includes(decision.lookup?.source ?? "")) && <p className="text-[11px] text-slate-400">Geocoding by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> or saved store locations · Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>}
    {Object.values(decisions).some(decision => decision.lookup?.source === "nominatim") && <p className="text-[11px] text-slate-400">Geocoding data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>}
  </section>;
}
