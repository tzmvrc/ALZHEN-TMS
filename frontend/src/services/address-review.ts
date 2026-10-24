import type { DestinationSource, LocationDecision } from "../components/admin/ImportDestinationReview";
import { rankDeliveryLocations } from "../../../packages/trip-import/location-query.js";

export function validAddress(decision: Pick<LocationDecision, "address" | "province" | "city" | "latitude" | "longitude">) {
  return Boolean(decision.address.trim() && decision.province.trim() && decision.city.trim() && decision.latitude.trim() && decision.longitude.trim()) && Number.isFinite(Number(decision.latitude)) && Math.abs(Number(decision.latitude)) <= 90 && Number.isFinite(Number(decision.longitude)) && Math.abs(Number(decision.longitude)) <= 180;
}
/** Store-master verification cannot confirm the currently reviewed trip address. */
export function confirmedStopAddress(decision?: Partial<LocationDecision>) {
  return Boolean(decision?.verified && !decision.pin_address_mismatch && validAddress({
    address: decision.address ?? "", province: decision.province ?? "", city: decision.city ?? "",
    latitude: decision.latitude ?? "", longitude: decision.longitude ?? "",
  }));
}
/** Only one unambiguous provider match qualifies for the explicit bulk confirmation. */
export function suggestedAddress(source: DestinationSource, decision: LocationDecision): LocationDecision | null {
  if (decision.verified || decision.pin_address_mismatch || decision.store_verified) return null;
  if (validAddress(decision)) return { ...decision, verified: true };
  if (decision.lookup?.status !== "found") return null;
  const candidates = rankDeliveryLocations(decision.lookup.candidates, source.province || decision.province, source.city || decision.city);
  if (candidates.length !== 1) return null;
  const match = candidates[0], next = { ...decision, address: match.display_name, latitude: String(match.latitude), longitude: String(match.longitude), province: source.province || decision.province || match.provinces?.[0] || "", city: source.city || decision.city || match.cities?.[0] || "", verified: true, pin_address_mismatch: false };
  return validAddress(next) ? next : null;
}
