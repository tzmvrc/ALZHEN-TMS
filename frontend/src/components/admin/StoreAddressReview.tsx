import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, MapPin, Search } from "lucide-react";
import type { DestinationSource, LocationDecision } from "./ImportDestinationReview";
import { failedTripLocation, resolveTripLocation, type TripLocationLookup } from "../../services/trip-location.service";
import { searchWarehouseLocations } from "../../services/master-data.service";

const RoadRouteMap = lazy(() => import("./RoadRouteMap"));
const input = "mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none disabled:bg-slate-50";

/** The location decision belongs to this card's full destination identity. */
export default function StoreAddressReview({ token, source, decision, disabled, checking = false, onChange }: {
  token: string; source: DestinationSource; decision: LocationDecision; disabled: boolean;
  checking?: boolean; onChange: (patch: Partial<LocationDecision>) => void;
}) {
  const [open, setOpen] = useState(false), [map, setMap] = useState(false);
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);
  const currentDecision = useRef(decision);
  currentDecision.current = decision;
  useEffect(() => { setBusy(false); return () => { requestVersion.current++; }; }, [source.key, token, disabled]);
  const valid = decision.latitude.trim() !== "" && decision.longitude.trim() !== ""
    && Number.isFinite(Number(decision.latitude)) && Math.abs(Number(decision.latitude)) <= 90
    && Number.isFinite(Number(decision.longitude)) && Math.abs(Number(decision.longitude)) <= 180;
  const canVerify = valid && Boolean(decision.address.trim() && decision.province.trim() && decision.city.trim());
  const missingProvince = !source.province.trim();
  const lookup = decision.lookup;
  const status = missingProvince ? "Province missing" : decision.verified ? "Verified" : checking || busy ? "Checking address" : lookup?.status === "missing_city" ? "City missing" : lookup?.status === "multiple" ? "Select an address" : valid ? "Needs verification" : "Location pending";
  async function search() {
    const version = ++requestVersion.current;
    setBusy(true);
    let result: TripLocationLookup;
    try {
      if (query.trim()) {
        const candidates = await searchWarehouseLocations(token, [query.trim(), decision.province, decision.city, "Philippines"].filter(Boolean).join(", "));
        result = { status: candidates.length > 1 ? "multiple" : candidates.length ? "review_required" : "not_found", candidates, source: "geoapify", source_key: source.key,
          message: candidates.length > 1 ? `Multiple locations found for Ship To ${source.shipTo} (${source.province}, ${source.city}). Please select the correct location.` : candidates.length ? "Select the address and verify its map pin before confirming." : "No address found. Enter the address and coordinates manually or save without coordinates." };
      } else result = await resolveTripLocation(token, { ...source, province: source.province || decision.province, city: source.city || decision.city });
    } catch { result = failedTripLocation(source); }
    if (requestVersion.current !== version) return;
    setBusy(false);
    const current = currentDecision.current;
    const candidate = result.status === "found" ? result.candidates[0] : undefined;
    onChange({ lookup: result, ...(candidate && !current.latitude && !current.longitude ? { address: candidate.display_name, latitude: String(candidate.latitude), longitude: String(candidate.longitude), verified: false } : {}) });
  }
  const edit = (patch: Partial<LocationDecision>) => onChange({ ...patch, verified: false, replace_verified: false });
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
    <div className="flex flex-wrap items-start gap-2 px-4 py-3">
      <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1"><p className="break-words text-sm text-slate-700">{decision.address || [source.city, source.province].filter(Boolean).join(", ") || "Address not found yet"}</p>
        <p role="status" className={`mt-1 flex items-center gap-1.5 text-xs ${decision.verified ? "text-emerald-700" : "text-slate-500"}`}>{checking || busy ? <Loader2 size={12} className="animate-spin" /> : decision.verified ? <CheckCircle2 size={12} /> : null}{status}</p>
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[#2678b9] hover:bg-blue-50">{open ? "Close review" : "Review location"}<ChevronDown size={13} className={open ? "rotate-180" : ""} /></button>
    </div>
    {(lookup?.source === "geoapify" || lookup?.source === "store" || valid) && <p className="px-4 pb-2 text-[10px] text-slate-400"><a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> / © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a></p>}
    {missingProvince && <p role="status" className="px-4 pb-3 text-xs text-amber-800">Cannot find exact location for Ship To {source.shipTo} - Province is missing.</p>}
    {!missingProvince && lookup?.status === "lookup_failed" && <p role="status" className="px-4 pb-3 text-xs text-amber-800">Address lookup is unavailable. You can save this store without coordinates.</p>}
    {open && <div className="space-y-4 border-t border-slate-200 bg-white p-4">
      {lookup?.message && !missingProvince && <p className="text-xs leading-5 text-slate-600">{lookup.message}</p>}
      <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-xs text-slate-500">Find the delivery address<input aria-label={`Find address for ${source.shipTo}`} className={input} placeholder={[source.shipTo, source.province, source.city].filter(Boolean).join(", ")} value={query} disabled={disabled || busy || checking} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!disabled && !busy && !checking && decision.province.trim() && decision.city.trim()) void search(); } }} /></label><button type="button" disabled={disabled || busy || checking || !decision.province.trim() || !decision.city.trim()} onClick={() => void search()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-[#2678b9] disabled:opacity-50"><Search size={14} />Find address</button></div>
      {Boolean(lookup?.candidates.length) && <div role="group" aria-label={`Address candidates for ${source.shipTo}`} className="max-h-48 space-y-2 overflow-y-auto">{lookup!.candidates.map((candidate, index) => <button type="button" key={`${candidate.latitude}:${candidate.longitude}:${index}`} disabled={disabled} aria-pressed={valid && Number(decision.latitude) === candidate.latitude && Number(decision.longitude) === candidate.longitude} onClick={() => edit({ address: candidate.display_name, latitude: String(candidate.latitude), longitude: String(candidate.longitude) })} className="block w-full rounded-lg border border-slate-200 p-3 text-left text-xs leading-5 text-slate-700 hover:bg-blue-50 aria-pressed:border-blue-400 aria-pressed:bg-blue-50 disabled:opacity-60">{candidate.display_name}</button>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => setMap(value => !value)} className="text-xs font-medium text-[#2678b9]">{map ? "Hide map" : "Review / adjust map pin"}</button><span className="text-[10px] text-slate-400">Address data: <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> / © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a></span></div>
      {map && <Suspense fallback={<p className="text-xs text-slate-500">Opening map…</p>}><RoadRouteMap rows={[]} mode="planned" selected="" onSelect={() => {}} height={240} draftPoint={valid ? { latitude: Number(decision.latitude), longitude: Number(decision.longitude) } : null} onCoordinatePick={disabled ? undefined : point => edit({ latitude: String(point.latitude), longitude: String(point.longitude) })} /></Suspense>}
      <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Edit address or coordinates</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["address", "province", "city", "latitude", "longitude"] as const).map(field => <label key={field} className={`text-xs capitalize text-slate-500 ${field === "address" ? "sm:col-span-2" : ""}`}>{field}<input aria-label={`${field} for ${source.shipTo}`} className={input} disabled={disabled || ((field === "province" || field === "city") && Boolean(source[field]))} value={decision[field]} onChange={event => edit({ [field]: event.target.value })} /></label>)}</div><p className="mt-2 text-[11px] text-slate-400">To change supplied Province or City, use Edit details on this store card.</p>
        {decision.verified && <label className="mt-3 flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" disabled={disabled} checked={decision.replace_verified} onChange={event => onChange({ replace_verified: event.target.checked })} />Allow replacing an existing verified store location if it conflicts.</label>}
      </details>
      <label className="flex items-start gap-2 text-xs leading-5 text-slate-700"><input type="checkbox" className="mt-1" disabled={disabled || !canVerify} checked={decision.verified} onChange={event => onChange({ verified: event.target.checked, replace_verified: false })} />I verified this delivery address and map pin. Save these coordinates when saving the trip.</label>
    </div>}
  </div>;
}
