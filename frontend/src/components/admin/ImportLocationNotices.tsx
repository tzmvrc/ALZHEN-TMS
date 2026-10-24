import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { DestinationSource, LocationDecision } from "./ImportDestinationReview";

export default function ImportLocationNotices({ destinations, decisions, checking }: { destinations: DestinationSource[]; decisions: Record<string, LocationDecision>; checking: boolean }) {
  if (!destinations.length) return null;
  const lookups = destinations.flatMap(source => {
    if (!(source.province.trim() || decisions[source.key]?.province.trim())) return [{ key: source.key, status: "missing_province", message: `Cannot find exact location for Ship To ${source.shipTo} - Province is missing.` }];
    const lookup = decisions[source.key]?.lookup;
    return lookup ? [{ key: source.key, ...lookup }] : [];
  });
  return <section aria-label="Delivery location notifications" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div><h3 className="text-sm font-semibold text-[#0b2341]">Delivery location checks</h3></div>
    {checking && <p role="status" className="flex items-center gap-2 text-xs text-slate-600"><Loader2 size={14} className="animate-spin" />Checking delivery locations. You can complete other trip details while this runs.</p>}
    <div className="divide-y divide-slate-100">{[false, true].map(verified => {
      const sources = destinations.filter(source => Boolean(decisions[source.key]?.verified) === verified);
      return <details key={String(verified)} className="py-2"><summary className="cursor-pointer text-xs font-medium text-slate-700">{verified ? "Verified" : "Unverified"} ({sources.length})</summary><ul className="mt-2 divide-y divide-slate-100">{sources.map(source => { const lookup = lookups.find(item => item.key === source.key); return <li key={source.key} className="flex items-start gap-2 py-2 text-xs text-slate-600">{verified ? <CheckCircle2 aria-hidden="true" size={14} className="shrink-0 text-emerald-600" /> : <AlertTriangle aria-hidden="true" size={14} className="shrink-0 text-amber-600" />}<span><strong>{source.shipTo}</strong>{lookup && <span className="mt-1 block">{lookup.message}</span>}</span></li>; })}</ul></details>;
    })}</div>
    {Object.values(decisions).some(decision => ["geoapify", "store"].includes(decision.lookup?.source ?? "")) && <p className="text-[11px] text-slate-400">Geocoding by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> or saved store locations · Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>}
    {Object.values(decisions).some(decision => decision.lookup?.source === "nominatim") && <p className="text-[11px] text-slate-400">Geocoding data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>}
  </section>;
}
