import { verifiedStoreCoordinates } from "../../services/trip-location.service";
import { useRef, useState } from "react";
import type { TripLocationLookup } from "../../services/trip-location.service";
import { customerStoreKey, storeIdentityText } from "../../services/store-location";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import StoreAddressReview from "./StoreAddressReview";
import { SectionCard } from "./shared";
import { fieldControl } from "./shared/styles";

export type DestinationSource = { key: string; customer: string; shipTo: string; province: string; city: string };
export type LocationDecision = { customer_id?: string; store_id?: string; store_label?: string; store_verified?: boolean; address: string; province: string; city: string; latitude: string; longitude: string; verified: boolean; replace_verified: boolean; lookup?: TripLocationLookup; pin_address_mismatch?: boolean; update_store_location?: boolean };

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


/** Compatibility wrapper: all location editing now uses the same delivery picker. */
export default function ImportDestinationReview({ token, destinations, decisions, onChange, disabled = false }: {
  token: string; destinations: DestinationSource[]; decisions: Record<string, LocationDecision>;
  onChange: (decisions: Record<string, LocationDecision>) => void; disabled?: boolean;
}) {
  const [selected, setSelected] = useState(""), [error, setError] = useState("");
  const latest = useRef(decisions); latest.current = decisions;
  const source = destinations.find(item => item.key === selected) ?? destinations[0];
  if (!source) return null;
  const decision: LocationDecision = decisions[source.key] ?? { address: "", province: source.province, city: source.city, latitude: "", longitude: "", verified: false, replace_verified: false, update_store_location: false };
  const update = (patch: Partial<LocationDecision>) => onChange({ ...latest.current, [source.key]: { ...(latest.current[source.key] ?? decision), ...patch } });
  return <SectionCard title="Destination & Location Review" description={`${destinations.filter(item => decisions[item.key]?.verified).length} of ${destinations.length} destinations confirmed`}>
    <div className="space-y-4">
      <label className="block text-xs text-slate-600">Select destination<select aria-label="Destination to review" className={`${fieldControl} mt-1`} value={source.key} onChange={event => { setSelected(event.target.value); setError(""); }}>{destinations.map(item => <option key={item.key} value={item.key}>{item.customer} / {item.shipTo} / {item.city || "Missing city"} / {item.province || "Missing province"}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><div><span className="block text-xs text-slate-500">Customer identity</span><SearchableRelationshipEditor token={token} kind="customers" autoFocus={false} disabled={disabled} value={source.customer} onSelect={option => update({ customer_id: option.id, store_id: undefined, store_label: undefined, store_verified: false, verified: false })} onCommitBlur={() => {}} onCancel={() => {}} /></div>
      <div><span className="block text-xs text-slate-500">Existing destination</span><SearchableRelationshipEditor token={token} kind="stores" autoFocus={false} disabled={disabled} customerId={decision.customer_id} value={decision.store_label ?? source.shipTo} onSelect={option => {
        const values = option.values ?? {};
        if (storeIdentityText(values.store_name) !== storeIdentityText(source.shipTo) || (source.province && storeIdentityText(values.province) !== storeIdentityText(source.province)) || (source.city && storeIdentityText(values.city) !== storeIdentityText(source.city))) { setError("Choose the store matching this Ship To / Province / City."); return; }
        if ((decision.verified || decision.store_verified) && !decision.replace_verified) { setError("Allow replacing the verified location before choosing another store record."); return; }
        const verified = verifiedStoreCoordinates(values);
        setError(""); update({ store_id: option.id, store_label: option.label, customer_id: values.customer_id, address: values.address ?? "", province: values.province ?? "", city: values.city ?? "", latitude: values.latitude ?? "", longitude: values.longitude ?? "", verified, store_verified: verified, replace_verified: false, pin_address_mismatch: false });
      }} onCommitBlur={() => {}} onCancel={() => {}} /></div></div>
      {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
      <StoreAddressReview key={source.key} token={token} source={source} decision={decision} disabled={disabled} onChange={update} />
    </div>
  </SectionCard>;
}
