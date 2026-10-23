import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Loader2, MapPin, Search } from "lucide-react";
import type { DestinationSource, LocationDecision } from "./ImportDestinationReview";
import { failedTripLocation, locationLookupFailed, resolveTripLocation, type TripLocationLookup } from "../../services/trip-location.service";
import type { LocationSearchResult } from "../../services/master-data.service";
import { rankDeliveryLocations } from "../../../../packages/trip-import/location-query.js";
import { StatusChip } from "./shared";
import { fieldControl, secondaryAction } from "./shared/styles";

const RoadRouteMap = lazy(() => import("./RoadRouteMap"));
const emptyMapRows: never[] = [];
/** Shared delivery-location review. Lookup suggestions never mutate a chosen point. */
export default function StoreAddressReview({ token, source, decision, disabled, checking = false, progress, compact = false, onChange }: {
  token: string; source: DestinationSource; decision: LocationDecision; disabled: boolean;
  checking?: boolean; progress?: string; compact?: boolean; onChange: (patch: Partial<LocationDecision>) => void;
}) {
  const [open, setOpen] = useState(false), [map, setMap] = useState(false);
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [active, setActive] = useState(0), [dismissed, setDismissed] = useState(false);
  const listId = useId(), inputRef = useRef<HTMLInputElement>(null), optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const requestVersion = useRef(0), current = useRef({ decision, onChange, disabled });
  current.current = { decision, onChange, disabled };
  const province = source.province.trim() || decision.province.trim(), city = source.city.trim() || decision.city.trim();
  useEffect(() => {
    requestVersion.current++; setBusy(false); setQuery(""); setActive(0); setDismissed(false);
    return () => { requestVersion.current++; };
  }, [source.key, token]);
  const savedLookup = decision.lookup;
  const lookup = (savedLookup?.status === "missing_province" && province) || (savedLookup?.status === "missing_city" && city) ? undefined : savedLookup;
  const candidates = rankDeliveryLocations(lookup?.candidates ?? [], province, city);
  const valid = decision.latitude.trim() !== "" && decision.longitude.trim() !== "" && Number.isFinite(Number(decision.latitude)) && Math.abs(Number(decision.latitude)) <= 90 && Number.isFinite(Number(decision.longitude)) && Math.abs(Number(decision.longitude)) <= 180;
  const protectedLocation = Boolean(decision.verified || decision.store_verified);
  const editable = !disabled && (!protectedLocation || decision.replace_verified);
  const canVerify = valid && Boolean(decision.address.trim() && province && city) && !decision.pin_address_mismatch;
  const failed = locationLookupFailed(lookup);
  const suggestion = !valid && candidates.length > 0;
  const status = decision.verified ? "Verified" : busy || checking ? "Pending" : failed ? "Lookup failed" : suggestion ? "Suggested" : valid ? "Needs verification" : "Pending";
  async function search(text: string) {
    const version = ++requestVersion.current;
    setBusy(true); setDismissed(false); setActive(0);
    let result: TripLocationLookup;
    const effective = { ...source, province, city };
    try { result = await resolveTripLocation(token, effective, text); }
    catch (error) { result = failedTripLocation(effective, error); }
    if (requestVersion.current !== version) return;
    setBusy(false); current.current.onChange({ lookup: result });
  }
  useEffect(() => {
    if (!open) { setBusy(false); return; }
    if (query.trim().length < 3 || dismissed) return;
    const version = ++requestVersion.current;
    setBusy(true);
    const timer = setTimeout(() => { if (requestVersion.current === version) { if (!current.current.disabled) void search(query); else setBusy(false); } }, 300);
    return () => clearTimeout(timer);
    // disabled changes must not invalidate an in-flight result; only source/query changes do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, province, city, source.key, token]);
  useEffect(() => { optionRefs.current[active]?.scrollIntoView({ block: "nearest" }); }, [active]);
  const edit = (patch: Partial<LocationDecision>, mismatch = false) => {
    if (!editable) return;
    onChange({ ...patch, verified: false, store_verified: protectedLocation || decision.store_verified, pin_address_mismatch: mismatch || decision.pin_address_mismatch });
  };
  function choose(candidate: LocationSearchResult) {
    if (!editable) { setOpen(true); return; }
    requestVersion.current++; setBusy(false); setDismissed(true);
    onChange({ address: candidate.display_name, latitude: String(candidate.latitude), longitude: String(candidate.longitude),
      province: province || candidate.provinces?.[0] || "", city: city || candidate.cities?.[0] || "", verified: false,
      store_verified: protectedLocation || decision.store_verified, pin_address_mismatch: false });
    setOpen(true);
  }
  const primaryLabel = failed ? "Retry lookup" : suggestion && candidates.length === 1 ? "Use this location" : !valid ? "Choose address" : !decision.verified ? "Verify" : "Review location";
  const showCandidates = candidates.length > 0 && !dismissed && !busy;
  return <section aria-label={`Location for ${source.shipTo}`} className={`overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 ${compact ? "text-xs" : ""}`}>
    <div className="flex flex-wrap items-start gap-3 p-4">
      <MapPin aria-hidden="true" size={16} className="mt-1 shrink-0 text-[#2678b9]" />
      <div className="min-w-0 flex-1"><p className="break-words text-sm text-slate-800">{decision.address || (suggestion ? candidates[0].display_name : [city, province].filter(Boolean).join(", ")) || "Choose a delivery address"}</p><div role="status" className="mt-2 flex flex-wrap items-center gap-2"><StatusChip label={status} tone={decision.verified ? "success" : failed ? "danger" : valid || suggestion ? "warning" : "neutral"} />{(busy || checking) && <Loader2 aria-hidden="true" size={14} className="animate-spin" />}<span className="text-xs text-slate-500">{progress || (busy ? "Searching addresses..." : suggestion ? "Suggestion only. Select it before verifying." : "")}</span></div></div>
      {primaryLabel !== "Review location" && <button type="button" className={secondaryAction} disabled={disabled || busy || checking} onClick={() => { if (failed) { void search(query); return; } setOpen(true); if (!lookup && !valid && query.trim().length < 3) void search(""); else if (primaryLabel === "Use this location") choose(candidates[0]); else if (primaryLabel === "Choose address") inputRef.current?.focus(); }}>{primaryLabel}</button>}
      <button type="button" aria-expanded={open} className={secondaryAction} onClick={() => setOpen(value => !value)}><ChevronDown aria-hidden="true" size={14} />{open ? "Close review" : "Review location"}</button>
    </div>
    {!province && <p role="status" className="px-4 pb-3 text-xs text-amber-800">Province missing. Complete the province in Edit address or coordinates.</p>}
    {!city && <p role="status" className="px-4 pb-3 text-xs text-amber-800">City missing. Complete the city before searching.</p>}
    {failed && <div role="status" className="px-4 pb-3 text-xs text-amber-800"><p>{lookup?.message}</p><p className="mt-1 font-mono">Diagnostic: {lookup?.error_code || lookup?.status}</p></div>}
    {protectedLocation && <label className="mx-4 mb-3 flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" disabled={disabled} checked={decision.replace_verified} onChange={event => onChange({ replace_verified: event.target.checked })} />Allow replacing an existing verified store location if it conflicts.</label>}
    {open && <div className="border-t border-slate-200 bg-white p-4">
      <label className="block text-xs font-medium text-slate-600">Find the delivery address<input ref={inputRef} maxLength={300} role="combobox" aria-label={`Find address for ${source.shipTo}`} aria-autocomplete="list" aria-expanded={showCandidates} aria-controls={listId} aria-activedescendant={showCandidates && candidates[active] ? `${listId}-${active}` : undefined} className={`${fieldControl} mt-1`} placeholder="Store name or full address" value={query} disabled={disabled} onChange={event => { requestVersion.current++; setBusy(event.target.value.trim().length >= 3); setQuery(event.target.value); setDismissed(false); setActive(0); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setDismissed(false); setActive(index => Math.min(Math.max(0, candidates.length - 1), Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter") { event.preventDefault(); if (!busy && showCandidates && candidates[active]) choose(candidates[active]); else if (!busy) void search(query); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); requestVersion.current++; setBusy(false); setDismissed(true); }
      }} /></label>
      <button type="button" className={`${secondaryAction} mt-2`} disabled={disabled || busy || !province || !city} onClick={() => void search(query)}><Search aria-hidden="true" size={14} />Find address</button>
      {busy && <p role="status" className="mt-2 text-xs text-slate-500">Searching delivery addresses...</p>}
      {!busy && lookup && !failed && !candidates.length && <p role="status" className="mt-2 text-xs text-amber-800">{lookup.message} No matching addresses for the supplied city/province. You can enter the address manually.</p>}
    </div>}
    {showCandidates && <div className="px-4 pb-4"><p className="mb-2 text-xs font-semibold text-[#0b2341]">{lookup?.status === "found" ? "Suggested location - confirmation required" : "Choose a matching delivery address"}</p><div id={listId} role="listbox" aria-label={`Address candidates for ${source.shipTo}`} className="max-h-56 space-y-2 overflow-y-auto">{candidates.map((candidate, index) => <button ref={node => { optionRefs.current[index] = node; }} id={`${listId}-${index}`} key={`${candidate.latitude}:${candidate.longitude}:${index}`} type="button" role="option" aria-selected={active === index} disabled={!editable} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(candidate)} className={`block w-full rounded-lg border p-3 text-left text-xs focus-visible:outline-2 focus-visible:outline-[#2678b9] disabled:opacity-60 ${active === index ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}><strong className="block text-slate-800">{candidate.name || source.shipTo}</strong><span className="mt-1 block text-slate-600">{candidate.display_name}</span><span className="mt-1 block text-slate-500">{[candidate.cities?.join(" / ") || city || "Unknown city", candidate.provinces?.join(" / ") || province || "Unknown province"].filter(Boolean).join(", ")}</span></button>)}</div></div>}
    {open && <div className="space-y-4 border-t border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3"><h5 className="text-xs font-semibold text-slate-600">{compact ? "From your trip" : "From your CSV"}</h5><p className="mt-2 text-xs">{source.shipTo || "No Ship To"}</p><p className="text-xs text-slate-500">{[source.city || "Missing city", source.province || "Missing province"].join(", ")}</p></div><div className="rounded-lg bg-blue-50/60 p-3"><h5 className="text-xs font-semibold text-slate-600">Chosen match</h5><p className="mt-2 break-words text-xs">{decision.address || "No location selected"}</p><p className="mt-1 text-xs tabular-nums text-slate-500">{valid ? `${decision.latitude}, ${decision.longitude}` : "Coordinates not selected"}</p></div></div>
      <button type="button" onClick={() => setMap(value => !value)} className={secondaryAction}>{map ? "Hide map" : "Review / adjust map pin"}</button>
      {map && <p className="text-xs text-slate-500">Drag the draft pin or click the map to move it. Check the address again after moving the pin.</p>}
      {map && <Suspense fallback={<p className="text-xs text-slate-500">Opening map...</p>}><RoadRouteMap rows={emptyMapRows} mode="planned" selected="" onSelect={() => {}} height={compact ? 220 : 280} draftPoint={valid ? { latitude: Number(decision.latitude), longitude: Number(decision.longitude) } : null} onCoordinatePick={!editable ? undefined : point => edit({ latitude: String(point.latitude), longitude: String(point.longitude) }, true)} /></Suspense>}
      <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Edit address or coordinates</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["address", "province", "city", "latitude", "longitude"] as const).map(field => <label key={field} className={`text-xs capitalize text-slate-500 ${field === "address" ? "sm:col-span-2" : ""}`}>{field}<input aria-label={`${field} for ${source.shipTo}`} className={`${fieldControl} mt-1`} disabled={!editable || ((field === "province" || field === "city") && Boolean(source[field].trim()))} value={decision[field]} onChange={event => edit({ [field]: event.target.value }, ["address", "latitude", "longitude"].includes(field))} /></label>)}</div><p className="mt-2 text-xs text-slate-500">Change supplied province/city in the store details. Missing geography can be entered here.</p></details>
      {decision.pin_address_mismatch && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>The address may not match the moved pin. Check the map and update the address before verifying.</p><label className="mt-2 flex items-start gap-2"><input type="checkbox" disabled={!editable || !valid || !decision.address.trim()} checked={false} onChange={event => { if (event.target.checked) onChange({ pin_address_mismatch: false, verified: false }); }} />I checked that the address describes this exact map pin.</label></div>}
      <label className="flex items-start gap-2 text-xs leading-5 text-slate-700"><input type="checkbox" disabled={disabled || !canVerify} checked={decision.verified} onChange={event => onChange({ verified: event.target.checked, province, city })} />I verified this delivery address and map pin. {compact ? "Use Save location to store to persist it." : "Save these coordinates when saving the trip."}</label>
    </div>}
    <p className="px-4 pb-3 text-[10px] text-slate-500">Address data: <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a></p>
  </section>;
}
