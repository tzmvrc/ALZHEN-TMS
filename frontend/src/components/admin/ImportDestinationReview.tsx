import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { searchWarehouseLocations, type LocationSearchResult } from "../../services/master-data.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
const RoadRouteMap = lazy(() => import("./RoadRouteMap"));
export type DestinationSource = { key: string; customer: string; shipTo: string; province: string; city: string };
export type LocationDecision = { customer_id?: string; store_id?: string; store_label?: string; store_verified?: boolean; address: string; province: string; city: string; latitude: string; longitude: string; verified: boolean; replace_verified: boolean };
export const destinationKey = (values: Record<string, string | null>) => JSON.stringify([values.customer_name, values.ship_to, values.province, values.city]);
const input = "w-full rounded-lg border border-slate-200 p-2 text-xs";
export default function ImportDestinationReview({ token, destinations, decisions, onChange, disabled }: { token: string; destinations: DestinationSource[]; decisions: Record<string, LocationDecision>; onChange: (decisions: Record<string, LocationDecision>) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const searchVersion = useRef(0);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [map, setMap] = useState(false);
  const source = destinations.find(d => d.key === selected) ?? destinations[0];
  const sourceQuery = source ? [source.shipTo, source.city, source.province].filter(Boolean).join(', ') : '';
  useEffect(() => {
    const version = ++searchVersion.current;
    if (!open || !sourceQuery) return;
    void Promise.resolve().then(async () => {
      if (version !== searchVersion.current) return;
      setBusy(true); setError(''); setResults([]);
      try { const candidates = await searchWarehouseLocations(token, sourceQuery); if (version === searchVersion.current) setResults(candidates); }
      catch (cause) { if (version === searchVersion.current) setError(cause instanceof Error ? cause.message : 'Location search unavailable. Review the address manually.'); }
      finally { if (version === searchVersion.current) setBusy(false); }
    });
    return () => { searchVersion.current++; };
  }, [open, token, source?.key, sourceQuery]);
  if (!source) return null;
  const decision: LocationDecision = decisions[source.key] ?? { address: "", province: source.province, city: source.city, latitude: "", longitude: "", verified: false, replace_verified: false };
  const update = (patch: Partial<LocationDecision>) => onChange({ ...decisions, [source.key]: { ...decision, ...patch, verified: patch.verified ?? false } });
  const valid = decision.latitude.trim() !== "" && decision.longitude.trim() !== "" && Number.isFinite(Number(decision.latitude)) && Math.abs(Number(decision.latitude)) <= 90 && Number.isFinite(Number(decision.longitude)) && Math.abs(Number(decision.longitude)) <= 180;
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const match = (candidate: LocationSearchResult) => Boolean(source.province && source.city && normalize(candidate.display_name).includes(normalize(source.province)) && normalize(candidate.display_name).includes(normalize(source.city.replace(/\bcity\b/gi, ""))));
  return <details onToggle={event=>setOpen(event.currentTarget.open)} className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#0b2341]">Destination identity and location review · {destinations.filter(d => decisions[d.key]?.verified).length}/{destinations.length} confirmed</summary>
    <div className="mt-3 space-y-3"><p className="text-xs text-slate-500">Unreviewed destinations stay unverified. Search results are candidates; choosing a result does not verify it. Select a customer/store to resolve ambiguous identities without changing original CSV text.</p>
      <select aria-label="Destination to review" className={input} value={source.key} onChange={e => { setSelected(e.target.value); setQuery(""); setResults([]); setError(""); setMap(false); }}>{destinations.map(d => <option key={d.key} value={d.key}>{d.customer} / {d.shipTo} / {d.city || "Missing city"} / {d.province || "Missing province"}</option>)}</select>
      <div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs">Customer identity</p><SearchableRelationshipEditor token={token} kind="customers" autoFocus={false} disabled={disabled} value={source.customer} onSelect={option => update({ customer_id: option.id, store_id: undefined, store_label: undefined, store_verified: false })} onCommitBlur={() => {}} onCancel={() => {}} /></div><div><p className="mb-1 text-xs">Existing destination</p><SearchableRelationshipEditor token={token} kind="stores" autoFocus={false} disabled={disabled} customerId={decision.customer_id} value={decision.store_label ?? source.shipTo} onSelect={option => { searchVersion.current++; setBusy(false); setResults([]); update({ store_id: option.id, store_label: option.label, store_verified: option.values?.location_verified === "true", latitude: option.values?.latitude ?? "", longitude: option.values?.longitude ?? "", customer_id: option.values?.customer_id, address: option.values?.address ?? decision.address, province: option.values?.province ?? decision.province, city: option.values?.city ?? decision.city }); }} onCommitBlur={() => {}} onCancel={() => {}} /></div></div>
      {decision.store_id && <p className="text-xs text-slate-500">{decision.store_verified ? "Existing destination has a verified location. Confirm only if you intend to update it." : "Existing destination location still needs verification."}</p>}
      {(!source.province || !source.city) && <p className="text-xs text-amber-800">Missing province or city. Complete the location details or keep this destination unverified.</p>}
      <div className="flex gap-2"><input aria-label="Search proposed destination" disabled={disabled} className={input} value={query} placeholder={[source.shipTo, source.city, source.province].filter(Boolean).join(", ")} onChange={e => setQuery(e.target.value)} /><button type="button" disabled={disabled || busy} className="shrink-0 rounded-full border px-3 text-xs" onClick={async () => { const version=++searchVersion.current; setBusy(true); setError(""); try { const candidates=await searchWarehouseLocations(token, query.trim() || sourceQuery); if(version===searchVersion.current)setResults(candidates); } catch (e) { if(version===searchVersion.current)setError(e instanceof Error ? e.message : "Location search unavailable."); } finally { if(version===searchVersion.current)setBusy(false); } }}>Find candidates</button></div>
      {busy && <p role="status" className="text-xs text-slate-500">Finding location candidates for review...</p>}
      {open && !busy && !error && results.length===0 && <p className="text-xs text-amber-800">No location candidate selected. Search again or enter the address and pin manually; the location can remain unverified.</p>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {results.length > 0 && <ul className="max-h-40 overflow-auto rounded border border-slate-200">{results.map((candidate, i) => <li key={i}><button type="button" disabled={disabled} className="w-full border-b p-2 text-left text-xs hover:bg-slate-50" onClick={() => update({ address: candidate.display_name, latitude: String(candidate.latitude), longitude: String(candidate.longitude) })}><strong>{match(candidate) ? "High-confidence candidate · review required" : "Approximate / geography mismatch · review required"}{results.length > 1 ? " · Multiple candidates" : ""}</strong><p>{candidate.display_name}</p></button></li>)}</ul>}
      <div className="grid gap-2 sm:grid-cols-2">{(["address", "province", "city", "latitude", "longitude"] as const).map(field => <label key={field} className="text-xs capitalize">{field}<input className={input} disabled={disabled} value={decision[field]} onChange={e => update({ [field]: e.target.value })} /></label>)}</div>
      <button type="button" disabled={disabled} onClick={() => setMap(current => !current)} className="text-xs text-blue-700">{map ? "Hide map" : "Review / adjust map pin"}</button>
      {map && <Suspense fallback={<p className="text-xs">Opening map…</p>}><RoadRouteMap rows={[]} mode="planned" selected="" onSelect={() => {}} height={260} draftPoint={valid ? { latitude: Number(decision.latitude), longitude: Number(decision.longitude) } : null} onCoordinatePick={point => update({ latitude: String(point.latitude), longitude: String(point.longitude) })} /></Suspense>}
      <label className="flex gap-2 text-xs"><input type="checkbox" disabled={disabled || !valid || !decision.province || !decision.city || !decision.address} checked={decision.verified} onChange={e => update({ verified: e.target.checked })} />I reviewed the store, address, geography and pin. Confirm these coordinates when saving.</label>
      <label className="flex gap-2 text-xs text-amber-800"><input type="checkbox" disabled={disabled || !decision.verified} checked={decision.replace_verified} onChange={e => update({ replace_verified: e.target.checked, verified: decision.verified })} />If this conflicts with an already verified store location, I explicitly authorize replacing that location.</label>
      <p className="text-xs text-slate-500">{decision.verified ? "Proposed verified location. Saved only when this import succeeds." : "Unverified location. No guessed coordinates will be saved."}</p>
    </div>
  </details>;
}
