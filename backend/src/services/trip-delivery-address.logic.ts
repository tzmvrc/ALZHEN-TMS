export type DeliveryAddress = { address: string; province: string; city: string; latitude: number; longitude: number; verified: true };
export function deliveryAddress(input: unknown): DeliveryAddress | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.verified !== true) return null;
  for (const field of ["address", "province", "city"]) if (typeof value[field] !== "string" || !String(value[field]).trim() || String(value[field]).length > (field === "address" ? 2000 : 200)) throw Error("Complete the delivery address, province and city before confirming.");
  for (const field of ["latitude", "longitude"]) if (value[field] == null || String(value[field]).trim() === "" || !Number.isFinite(Number(value[field])) || Math.abs(Number(value[field])) > (field === "latitude" ? 90 : 180)) throw Error("Choose a valid delivery map pin.");
  if (value.pin_address_mismatch === true) throw Error("Confirm the address matches the map pin.");
  return { address: String(value.address).trim(), province: String(value.province).trim(), city: String(value.city).trim(), latitude: Number(value.latitude), longitude: Number(value.longitude), verified: true };
}
/** The legacy import RPC writes verified locations to the store. Opt-out must strip the point there. */
export function importLocationForRpc(value: Record<string, unknown>): Record<string, unknown> {
  return value.update_store_location === false ? { ...value, verified: false, address: "", latitude: "", longitude: "" } : { ...value };
}
