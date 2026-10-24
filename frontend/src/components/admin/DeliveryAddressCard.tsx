import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { DestinationSource, LocationDecision } from "./ImportDestinationReview";
import { resolveTripLocation } from "../../services/trip-location.service";
import { rankDeliveryLocations } from "../../../../packages/trip-import/location-query.js";
import { confirmedStopAddress, validAddress } from "../../services/address-review";
import { StatusChip } from "./shared";
import TripPopover from "./shared/TripPopover";
import { fieldControl, secondaryAction } from "./shared/styles";

const RoadRouteMap = lazy(() => import("./RoadRouteMap"));
const noRows: never[] = [];
export type AddressCardProps = { token: string; source: DestinationSource; decision: LocationDecision; disabled: boolean; checking?: boolean; progress?: string; compact?: boolean; sourceAddress?: string; onChange: (patch: Partial<LocationDecision>) => void; onSaveStore?: (decision: LocationDecision) => Promise<void>; storeSaved?: boolean };

export default function DeliveryAddressCard({ token, source, decision, disabled, checking = false, onChange, compact = false, sourceAddress, onSaveStore, storeSaved }: AddressCardProps) {
  const [panel, setPanel] = useState<"find" | "edit" | "map" | null>(null), [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [alsoStore, setAlsoStore] = useState(false), [draft, setDraft] = useState(decision);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  const province = source.province || decision.province, city = source.city || decision.city;
  const confirmed = confirmedStopAddress(decision);
  const candidates = rankDeliveryLocations(decision.lookup?.candidates ?? [], province, city);
  const single = decision.lookup?.status === "found" && candidates.length === 1 ? candidates[0] : null;
  const selected = validAddress({ ...decision, province, city }) ? { ...decision, province, city } : single ? { ...decision, province: province || single.provinces?.[0] || "", city: city || single.cities?.[0] || "", address: single.display_name, latitude: String(single.latitude), longitude: String(single.longitude) } : null;
  const open = (next: typeof panel) => { setDraft(decision); setPanel(next); setError(""); };
  const search = async () => {
    const request = ++version.current; setBusy(true); setError("");
    try { const lookup = await resolveTripLocation(token, { ...source, province, city }, query); if (request === version.current) onChange({ lookup }); }
    catch { if (request === version.current) setError("Address search is unavailable. Try again or enter the address yourself."); }
    finally { if (request === version.current) setBusy(false); }
  };
  const confirm = async () => {
    if (!selected || !validAddress(selected)) return;
    const updateStore = alsoStore || decision.update_store_location === true;
    const next = { ...selected, verified: true, pin_address_mismatch: false, update_store_location: updateStore };
    onChange(next); setError("");
    if (updateStore && onSaveStore) { setBusy(true); try { await onSaveStore(next); } catch { setError("Address confirmed. The store update failed; turn the store toggle off and on to retry."); } finally { setBusy(false); } }
  };
  const csvText = sourceAddress || [source.shipTo, source.city, source.province].filter(Boolean).join(", ");
  const highlight = (value: string) => value.split(/(,\s*)/).map((part, index) => part.trim() && !part.startsWith(",") && !csvText.toLocaleLowerCase().includes(part.trim().toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>);
  return <section className={`address-card ${confirmed ? "is-verified" : selected ? "is-unverified" : "needs-address"}`} aria-label={`Delivery address for ${source.shipTo}`}>
    <header><div className="min-w-0"><h4>Delivery address</h4></div><StatusChip label={busy || checking ? "Pending" : confirmed ? "Verified" : selected ? "Unverified" : "Needs address"} tone={confirmed ? "success" : selected ? "neutral" : "warning"} />{!confirmed && !selected && <button type="button" className={secondaryAction} disabled={disabled || busy || checking} onClick={() => open("find")}>Find address</button>}</header>
    {selected && <div className="address-compare"><div><span>{compact ? "From trip" : "From CSV"}</span><p>{csvText}</p></div><div><span>Suggested match</span><p>{highlight(selected.address)}</p><small>{selected.latitude}, {selected.longitude}</small></div></div>}
    {!selected && <p className="text-xs text-slate-500">{!province || !city ? "Add province and city to search, or enter an address." : "Find a match or enter an address and map pin."}</p>}
    {selected && <div className="address-confirm-row">{confirmed ? null : <button type="button" className="address-confirm" disabled={disabled || busy || checking || !validAddress(selected)} onClick={() => void confirm()}>Confirm address</button>}<span className="text-[11px] text-slate-500">Saves coordinates with this trip.</span><label><input type="checkbox" disabled={disabled || busy || Boolean(storeSaved)} checked={storeSaved || alsoStore || decision.update_store_location === true} onChange={event => { const checked = event.target.checked; setAlsoStore(checked); onChange({ update_store_location: checked }); if (checked && decision.verified && onSaveStore) { setBusy(true); setError(""); void onSaveStore({ ...decision, update_store_location: true }).catch(() => setError("Address confirmed. The store update failed; turn the store toggle off and on to retry.")).finally(() => setBusy(false)); } }} />Also update the store’s saved location<span className="address-store-info" tabIndex={0} role="img" aria-label="Updating the saved store location affects other trips and remains saved if you close this draft." title="Updating the saved store location affects other trips and remains saved if you close this draft.">i</span></label></div>}
    <div className="address-links"><button type="button" disabled={disabled} onClick={() => open("map")}><MapPin size={12} />Adjust pin</button><button type="button" disabled={disabled} onClick={() => open("edit")}>Edit address</button></div>
    {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
    <small className="address-attribution">Address data: <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></small>
    {panel && <TripPopover title={panel === "find" ? "Find delivery address" : panel === "map" ? "Adjust delivery pin" : "Edit delivery address"} onClose={() => { version.current++; setBusy(false); setPanel(null); }}>
      {panel === "find" ? <div className="space-y-3"><label>Address search<input autoFocus aria-label={`Find address for ${source.shipTo}`} className={fieldControl} value={query} placeholder="Store name or full address" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} /></label><button type="button" disabled={busy || !province || !city} className={secondaryAction} onClick={() => void search()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Find matches</button>{!province || !city ? <p className="text-xs text-amber-800">Enter province and city under Edit address or coordinates first.</p> : null}<div className="space-y-2">{candidates.map((candidate, index) => <button type="button" key={index} className="address-candidate" onClick={() => { onChange({ address: candidate.display_name, latitude: String(candidate.latitude), longitude: String(candidate.longitude), province: province || candidate.provinces?.[0] || "", city: city || candidate.cities?.[0] || "", verified: false, pin_address_mismatch: false, replace_verified: Boolean(decision.store_verified) }); setPanel(null); }}><strong>{candidate.name || source.shipTo}</strong><span>{candidate.display_name}</span></button>)}</div>{decision.lookup && !busy && !candidates.length && <p className="text-xs text-amber-800">No exact match. Enter the address yourself and check the map pin.</p>}</div> : <div className="space-y-4">
        {panel === "map" && <Suspense fallback={<p>Opening map…</p>}><RoadRouteMap rows={noRows} mode="planned" selected="" onSelect={() => {}} height={220} draftPoint={draft.latitude && draft.longitude ? { latitude: Number(draft.latitude), longitude: Number(draft.longitude) } : null} onCoordinatePick={point => setDraft(current => ({ ...current, latitude: String(point.latitude), longitude: String(point.longitude) }))} /></Suspense>}
        <div className="grid gap-3 sm:grid-cols-2">{(["address", "province", "city", "latitude", "longitude"] as const).map(field => <label key={field} className={field === "address" ? "sm:col-span-2" : ""}>{field}<input autoFocus={field === "address" && panel === "edit"} aria-label={`${field} for ${source.shipTo}`} className={fieldControl} value={draft[field]} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} disabled={(field === "province" || field === "city") && Boolean(source[field])} /></label>)}</div>
        <button type="button" className={secondaryAction} onClick={() => { onChange({ ...draft, verified: false, pin_address_mismatch: false, replace_verified: Boolean(decision.store_verified || decision.verified) }); setPanel(null); }}>Use these details</button>
      </div>}
    </TripPopover>}
  </section>;
}
