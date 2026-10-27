import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { MapPin, Search } from "lucide-react";
import { rankDeliveryLocations } from "../../../../packages/trip-import/location-query.js";
import { validAddress } from "../../services/address-review";
import { resolveTripLocation } from "../../services/trip-location.service";
import type { ImportPreview } from "../../services/trip-import.service";
import { storeIdentityText } from "../../services/store-location";
import DeliveryAddressCard from "./DeliveryAddressCard";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import type { DestinationSource, LocationDecision } from "./ImportDestinationReview";

const RoadRouteMap = lazy(() => import("./RoadRouteMap"));
const emptyRows: never[] = [];
const emptyDecision = (source: DestinationSource): LocationDecision => ({ address: "", province: source.province, city: source.city, latitude: "", longitude: "", verified: false, replace_verified: false });

export default function CsvStoreReview({ token, destinations, matches, decisions, disabled, onChange, onError }: {
  token: string;
  destinations: DestinationSource[];
  matches: ImportPreview["store_matches"];
  decisions: Record<string, LocationDecision>;
  disabled: boolean;
  onChange: Dispatch<SetStateAction<Record<string, LocationDecision>>>;
  onError: (message: string) => void;
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const request = useRef(0);
  const source = destinations.find(item => item.key === selectedKey) ?? destinations[0];
  const sourceKey = source?.key, province = source?.province, city = source?.city, shipTo = source?.shipTo, customer = source?.customer;
  const hasLookup = Boolean(sourceKey && decisions[sourceKey]?.lookup);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!sourceKey || !province || !city || matches?.[sourceKey]?.status === "matched" || hasLookup) return;
    const lookupSource: DestinationSource = { key: sourceKey, province, city, shipTo: shipTo ?? "", customer: customer ?? "" };
    const id = ++request.current;
    const timer = window.setTimeout(() => {
      setBusy(true); setLookupError("");
      void resolveTripLocation(token, lookupSource).then(lookup => {
        if (id !== request.current) return;
        onChange(current => ({ ...current, [sourceKey]: { ...(current[sourceKey] ?? emptyDecision(lookupSource)), lookup } }));
      }).catch(cause => {
        if (id === request.current) setLookupError(cause instanceof Error ? cause.message : "Location search is unavailable. Search again or place a pin manually.");
      }).finally(() => { if (id === request.current) setBusy(false); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sourceKey, province, city, shipTo, customer, token, matches, hasLookup, onChange]);
  if (!source) return <section className="csv-card"><h3>Stores</h3><p>No stores in the current preview.</p></section>;
  const decision = decisions[source.key] ?? emptyDecision(source);
  const match = matches?.[source.key];
  const confirmed = (item: DestinationSource) => Boolean(decisions[item.key]?.verified || decisions[item.key]?.store_verified || matches?.[item.key]?.status === "matched");
  const confirmedCount = destinations.filter(confirmed).length;
  const candidates = rankDeliveryLocations(decision.lookup?.candidates ?? [], source.province || decision.province, source.city || decision.city);
  const selectedAddress = decision.address || candidates[0]?.display_name || "";
  const selectedPoint = decision.latitude && decision.longitude ? { latitude: Number(decision.latitude), longitude: Number(decision.longitude) } : candidates[0] ? { latitude: candidates[0].latitude, longitude: candidates[0].longitude } : null;
  const update = (patch: Partial<LocationDecision>) => onChange(current => ({ ...current, [source.key]: { ...(current[source.key] ?? emptyDecision(source)), ...patch } }));
  async function search() {
    const id = ++request.current;
    setBusy(true); setLookupError("");
    try {
      const lookup = await resolveTripLocation(token, source, query);
      if (id === request.current) update({ lookup });
    } catch (cause) {
      if (id === request.current) setLookupError(cause instanceof Error ? cause.message : "Location search is unavailable. Search again or place a pin manually.");
    } finally { if (id === request.current) setBusy(false); }
  }
  const choose = (candidate: typeof candidates[number]) => update({ address: candidate.display_name, province: source.province || candidate.provinces?.[0] || "", city: source.city || candidate.cities?.[0] || "", latitude: String(candidate.latitude), longitude: String(candidate.longitude), verified: false, pin_address_mismatch: false, replace_verified: Boolean(decision.store_verified) });
  return <div className="csv-store-layout">
    <section className="csv-store-list" aria-label="Stores in source file"><div className="csv-store-list-heading"><h3>Stores</h3><span>{confirmedCount} of {destinations.length} confirmed</span></div><div className="csv-store-scroll">{destinations.slice(0, showMore ? undefined : 8).map((item, index) => <button key={item.key} type="button" className="csv-store-item" data-selected={item.key === source.key} onClick={() => { request.current++; setSelectedKey(item.key); setQuery(""); setLookupError(""); setBusy(false); }}><span><strong>{item.shipTo || `Ship-to ${index + 1}`}</strong><small>Ship-to {index + 1} of {destinations.length}</small></span><span className={confirmed(item) ? "csv-pill-success" : "csv-pill-warning"}>{confirmed(item) ? "Auto-matched" : "Pick location"}</span></button>)}{destinations.length > 8 && <button type="button" className="csv-store-more" onClick={() => setShowMore(value => !value)}>{showMore ? "Show fewer stores" : `+ ${destinations.length - 8} more stores`}</button>}</div></section>
    <section className="csv-card csv-location-card" aria-label={`Confirm location for ${source.shipTo}`}><h3>Confirm location <span>· Ship-to {destinations.indexOf(source) + 1}</span></h3><div className="csv-location-fields"><label>Store / ship-to<input readOnly value={source.shipTo} /></label><label>Province<input readOnly value={source.province} /></label><label>City<input readOnly value={source.city} /></label></div>
      {match?.customer_status !== "matched" && !decision.customer_id && <div className="csv-correction"><h4>Customer identity</h4><p>Select the existing customer for this store, or enter its actual code to create a new customer.</p><label>Existing customer<SearchableRelationshipEditor presentation="form" token={token} kind="customers" value={decision.customer_label || source.customer} autoFocus={false} disabled={disabled} onSelect={option => update({ customer_id: option.id, customer_label: option.label, customer_code: undefined, store_id: undefined, store_label: undefined })} onCommitBlur={() => {}} onCancel={() => {}} /></label>{!decision.customer_id && <details><summary>Create new customer with code</summary><label>Customer code<input value={decision.customer_code ?? ""} disabled={disabled} maxLength={50} onChange={event => update({ customer_code: event.target.value.trim(), store_id: undefined })} placeholder="Actual customer code" /></label></details>}</div>}
      {match?.status !== "matched" && !decision.store_id && <div className="csv-correction"><h4>Existing store</h4><p>Choose the exact store record when one exists.</p><SearchableRelationshipEditor presentation="form" token={token} kind="stores" customerId={decision.customer_id ?? match?.customer_id} value={decision.store_label || ""} autoFocus={false} disabled={disabled} onSelect={option => { const values = option.values ?? {}; if (storeIdentityText(values.store_name || option.label) !== storeIdentityText(source.shipTo) || source.province && storeIdentityText(values.province) !== storeIdentityText(source.province) || source.city && storeIdentityText(values.city) !== storeIdentityText(source.city)) { onError("Choose the store matching this name, province and city."); return; } update({ store_id: option.id, store_label: option.label, customer_id: values.customer_id || undefined, customer_code: undefined }); }} onCommitBlur={() => {}} onCancel={() => {}} /></div>}
      <div className="csv-map-heading"><h4>Address matches</h4><button type="button" disabled={busy || disabled} onClick={() => void search()}><Search size={16} />{busy ? "Searching…" : "Find matches"}</button></div><label className="csv-search-label">Search again<input value={query} disabled={busy || disabled} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Store name or address" /></label>
      {lookupError && <p role="alert" className="csv-warning-text">{lookupError}</p>}{decision.lookup?.message && !candidates.length && <p className="csv-warning-text">{decision.lookup.message}</p>}
      {candidates.length > 0 && <div className="csv-location-results">{candidates.map((candidate, index) => <button key={`${candidate.latitude}-${candidate.longitude}-${index}`} type="button" disabled={disabled} className="csv-location-option" data-selected={selectedAddress === candidate.display_name} onClick={() => choose(candidate)}><span className={index === 0 ? "csv-pill-success" : "csv-pill-neutral"}>{index === 0 ? "Best match" : "Other"}</span><span>{candidate.display_name}</span></button>)}</div>}
      {candidates.length > 0 && !decision.address && <p className="csv-muted">Best match shown on the map. Choose the exact address to confirm it.</p>}
      {decision.address && !decision.verified && validAddress(decision) && <button type="button" className="csv-confirm-address" disabled={disabled} onClick={() => update({ verified: true, pin_address_mismatch: false })}>Confirm selected address</button>}
      <div className="csv-map-preview" aria-label="Map preview of selected address">{selectedPoint ? <Suspense fallback={<p>Opening map…</p>}><RoadRouteMap rows={emptyRows} mode="planned" selected="" onSelect={() => {}} height={190} draftPoint={selectedPoint} /></Suspense> : <div><MapPin size={20} /><span>Map preview appears after selecting an address</span></div>}</div>
      <details className="csv-location-adjust"><summary>Search or place a pin manually</summary><DeliveryAddressCard key={source.key} token={token} source={source} decision={decision} disabled={disabled} onChange={update} /></details>
    </section>
  </div>;
}
