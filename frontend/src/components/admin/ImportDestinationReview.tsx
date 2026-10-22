import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { searchWarehouseLocations, type LocationSearchResult } from "../../services/master-data.service";
import type { TripLocationLookup } from "../../services/trip-location.service";
import { customerStoreKey, storeIdentityText } from "../../services/store-location";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { MapPin, Search, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";

const RoadRouteMap = lazy(() => import("./RoadRouteMap"));

export type DestinationSource = { key: string; customer: string; shipTo: string; province: string; city: string };
export type LocationDecision = { customer_id?: string; store_id?: string; store_label?: string; store_verified?: boolean; address: string; province: string; city: string; latitude: string; longitude: string; verified: boolean; replace_verified: boolean; lookup?: TripLocationLookup };

export const destinationKey = customerStoreKey;
export function recoverDestinationDecisions(saved: Record<string, LocationDecision> = {}) {
  const recovered: Record<string, LocationDecision> = {};
  for (const [key, decision] of Object.entries(saved)) {
    let identity = key;
    try {
      const parts: unknown = JSON.parse(key);
      if (Array.isArray(parts) && parts.length === 4) identity = destinationKey({ customer_name: parts[0], ship_to: parts[1], province: parts[2], city: parts[3] });
    } catch { /* Retain unknown historical keys rather than discard saved reviews. */ }
    recovered[identity] = decision;
  }
  return recovered;
}

const inputClass = "w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm shadow-sm transition-colors focus:border-[#2678b9] focus:outline-none focus:ring-1 focus:ring-[#2678b9] disabled:opacity-60";

export default function ImportDestinationReview({ 
  token, 
  destinations, 
  decisions, 
  onChange, 
  disabled 
}: { 
  token: string; 
  destinations: DestinationSource[]; 
  decisions: Record<string, LocationDecision>; 
  onChange: (decisions: Record<string, LocationDecision>) => void; 
  disabled?: boolean 
}) {
  const [open, setOpen] = useState(false);
  const searchVersion = useRef(0);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [map, setMap] = useState(false);

  const source = destinations.find(d => d.key === selected) ?? destinations[0];

  const sourceLookup = decisions[source?.key ?? ""]?.lookup;
  useEffect(() => {
    searchVersion.current++;
    setResults(sourceLookup?.candidates ?? []);
    setBusy(false);
    setError("");
    return () => { searchVersion.current++; };
  }, [source?.key, sourceLookup]);

  if (!source) return null;

  const decision: LocationDecision = decisions[source.key] ?? { address: "", province: source.province, city: source.city, latitude: "", longitude: "", verified: false, replace_verified: false };
  const update = (patch: Partial<LocationDecision>) => onChange({ ...decisions, [source.key]: { ...decision, ...patch, verified: patch.verified ?? false } });
  
  const valid = decision.latitude.trim() !== "" && decision.longitude.trim() !== "" && Number.isFinite(Number(decision.latitude)) && Math.abs(Number(decision.latitude)) <= 90 && Number.isFinite(Number(decision.longitude)) && Math.abs(Number(decision.longitude)) <= 180;
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const match = (candidate: LocationSearchResult) => Boolean(source.province && source.city && normalize(candidate.display_name).includes(normalize(source.province)) && normalize(candidate.display_name).includes(normalize(source.city.replace(/\bcity\b/gi, ""))));

  const verifiedCount = destinations.filter(d => decisions[d.key]?.verified).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button 
        type="button" 
        onClick={() => setOpen(!open)} 
        className="flex w-full items-center justify-between bg-white p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h3 className="text-base font-semibold text-[#0b2341]">Destination & Location Review</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {verifiedCount} of {destinations.length} destinations confirmed
            </p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 bg-slate-50/30">
          <p className="mb-5 text-xs text-slate-500">
            Each Ship To / Province / City is a separate destination. Choose an existing store only when all three match. To change supplied geography, edit the mapped CSV first; missing geography can be completed here. Location candidates still need verification.
          </p>

          <div className="space-y-6">
            {/* Destination Selector */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Select Destination to Review</label>
              <select 
                aria-label="Destination to review" 
                className={inputClass} 
                value={source.key} 
                onChange={e => { setSelected(e.target.value); setQuery(""); setResults([]); setError(""); setMap(false); }}
              >
                {destinations.map(d => (
                  <option key={d.key} value={d.key}>
                    {d.customer} / {d.shipTo} / {d.city || "Missing city"} / {d.province || "Missing province"}
                  </option>
                ))}
              </select>
            </div>

            {/* Identity Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Customer Identity</label>
                <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                  <SearchableRelationshipEditor 
                    token={token} 
                    kind="customers" 
                    autoFocus={false} 
                    disabled={disabled} 
                    value={source.customer} 
                    onSelect={option => update({ customer_id: option.id, store_id: undefined, store_label: undefined, store_verified: false })} 
                    onCommitBlur={() => {}} 
                    onCancel={() => {}} 
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Existing Destination</label>
                <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                  <SearchableRelationshipEditor 
                    token={token} 
                    kind="stores" 
                    autoFocus={false} 
                    disabled={disabled} 
                    customerId={decision.customer_id} 
                    value={decision.store_label ?? source.shipTo} 
                    onSelect={option => { 
                      const values = option.values ?? {};
                      if (storeIdentityText(values.store_name) !== storeIdentityText(source.shipTo)
                        || (source.province && storeIdentityText(values.province) !== storeIdentityText(source.province))
                        || (source.city && storeIdentityText(values.city) !== storeIdentityText(source.city))) {
                        setError("This store belongs to a different Ship To / Province / City. Choose the matching branch or leave it unselected to create this location.");
                        return;
                      }
                      setError("");
                      searchVersion.current++; 
                      setBusy(false); 
                      setResults([]); 
                      update({ 
                        store_id: option.id, 
                        store_label: option.label, 
                        store_verified: option.values?.location_verified === "true", 
                        latitude: option.values?.latitude ?? "", 
                        longitude: option.values?.longitude ?? "", 
                        customer_id: option.values?.customer_id, 
                        address: option.values?.address ?? decision.address, 
                        province: option.values?.province ?? decision.province, 
                        city: option.values?.city ?? decision.city 
                      }); 
                    }} 
                    onCommitBlur={() => {}} 
                    onCancel={() => {}} 
                  />
                </div>
              </div>
            </div>

            {/* Status Notices */}
            {decision.store_id && (
              <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${decision.store_verified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
                {decision.store_verified ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <p>{decision.store_verified ? "Existing destination has a verified location. Confirm only if you intend to update it." : "Existing destination location still needs verification."}</p>
              </div>
            )}
            
            {(!source.province || !source.city) && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Missing province or city. Complete the location details or keep this destination unverified.</p>
              </div>
            )}

            {/* Search Area */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="mb-2 block text-xs font-medium text-slate-600">Search for address / coordinates</label>
              <div className="flex gap-2">
                <input 
                  aria-label="Search proposed destination" 
                  disabled={disabled} 
                  className={inputClass} 
                  value={query} 
                  placeholder={[source.shipTo, source.city, source.province].filter(Boolean).join(", ")} 
                  onChange={e => setQuery(e.target.value)} 
                />
                <button 
                  type="button" 
                  disabled={disabled || busy || !decision.province.trim() || !decision.city.trim()}
                  className="flex shrink-0 items-center gap-2 rounded-xl bg-[#2678b9] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1f6499] disabled:opacity-50" 
                  onClick={async () => { 
                    const version=++searchVersion.current; 
                    setBusy(true); 
                    setError(""); 
                    try { 
                      const candidates=await searchWarehouseLocations(token, query.trim() || [source.shipTo, decision.province, decision.city, "Philippines"].filter(Boolean).join(", "));
                      if(version===searchVersion.current)setResults(candidates); 
                    } catch (e) { 
                      if(version===searchVersion.current)setError(e instanceof Error ? e.message : "Location search unavailable."); 
                    } finally { 
                      if(version===searchVersion.current)setBusy(false); 
                    } 
                  }}
                >
                  <Search className="h-4 w-4" /> Find
                </button>
              </div>
              
              {busy && <p role="status" className="mt-3 text-xs text-slate-500 flex items-center gap-2"><span className="animate-spin h-3 w-3 border-2 border-slate-400 border-t-transparent rounded-full"/> Finding location candidates for review...</p>}
              {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
              {open && !busy && !error && results.length===0 && <p className="mt-3 text-xs text-amber-800">No location candidate selected. Search again or enter the address and pin manually; the location can remain unverified.</p>}
              
              {results.length > 0 && (
                <ul className="mt-3 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
                  {results.map((candidate, i) => (
                    <li key={i}>
                      <button 
                        type="button" 
                        disabled={disabled} 
                        className="w-full p-3 text-left hover:bg-slate-50 transition-colors" 
                        onClick={() => update({ address: candidate.display_name, latitude: String(candidate.latitude), longitude: String(candidate.longitude) })}
                      >
                        <strong className={`block text-xs ${match(candidate) ? "text-emerald-700" : "text-amber-700"}`}>
                          {match(candidate) ? "High-confidence candidate · review required" : "Approximate / geography mismatch · review required"}
                          {results.length > 1 ? " · Multiple candidates" : ""}
                        </strong>
                        <p className="mt-1 text-xs text-slate-600">{candidate.display_name}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {results.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Address search: <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> / © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a>. Saved store locations may also appear.</p>}
            </div>

            {/* Manual Form Grid */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-xs font-semibold text-slate-700">Location Details</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["address", "province", "city", "latitude", "longitude"] as const).map(field => (
                  <label key={field} className={`text-xs ${field === "address" ? "sm:col-span-2" : ""}`}>
                    <span className="mb-1 block capitalize text-slate-500">{field}</span>
                    <input 
                      className={inputClass} 
                      disabled={disabled} 
                      value={decision[field]} 
                      onChange={e => update({ [field]: e.target.value })} 
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Map & Toggle */}
            <div>
              <button 
                type="button" 
                disabled={disabled} 
                onClick={() => setMap(current => !current)} 
                className="text-sm font-medium text-[#2678b9] hover:underline"
              >
                {map ? "Hide map" : "Review / adjust map pin"}
              </button>
              
              {map && (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                  <Suspense fallback={<p className="p-4 text-xs text-slate-500">Opening map…</p>}>
                    <RoadRouteMap 
                      rows={[]} 
                      mode="planned" 
                      selected="" 
                      onSelect={() => {}} 
                      height={260} 
                      draftPoint={valid ? { latitude: Number(decision.latitude), longitude: Number(decision.longitude) } : null} 
                      onCoordinatePick={point => update({ latitude: String(point.latitude), longitude: String(point.longitude) })} 
                    />
                  </Suspense>
                </div>
              )}
            </div>

            {/* Confirmation Area */}
            <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <label className="flex items-start gap-3 text-xs text-emerald-900 cursor-pointer">
                <input 
                  type="checkbox" 
                  disabled={disabled || !valid || !decision.province || !decision.city || !decision.address} 
                  checked={decision.verified} 
                  onChange={e => update({ verified: e.target.checked })} 
                  className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" 
                />
                <span>I reviewed the store, address, geography and pin. Confirm these coordinates when saving.</span>
              </label>
              
              <label className="flex items-start gap-3 text-xs text-amber-800 cursor-pointer">
                <input 
                  type="checkbox" 
                  disabled={disabled || !decision.verified} 
                  checked={decision.replace_verified} 
                  onChange={e => update({ replace_verified: e.target.checked, verified: decision.verified })} 
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" 
                />
                <span>If this conflicts with an already verified store location, I explicitly authorize replacing that location.</span>
              </label>
            </div>

            <p className="text-xs text-slate-500 text-center">
              {decision.verified ? "Proposed verified location. Saved only when this import succeeds." : "Matched or selected coordinates are saved as unverified. Map routing uses them only after admin confirmation."}
            </p>

          </div>
        </div>
      )}
    </div>
  );
}
