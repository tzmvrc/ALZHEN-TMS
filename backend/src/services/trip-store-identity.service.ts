import { createHash } from "node:crypto";
import { supabaseAdmin as db } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { destinationLookupKey, storeIdentityText, type Destination } from "./trip-location.logic.js";

type Decision = Record<string, unknown>;
type Store = { id: string; customer_id: string; name: string; province: string | null; city: string | null };
const pattern = (name: string) => name.trim().split(/\s+/).map(part => part.replace(/[\\%_]/g, "\\$&")).join("%");

/** Resolve only by customer + full location identity, never by Ship To alone.
 * New locations use the existing RPC's customer-scoped code identity so the
 * installed resolver can create same-name branches without a schema change.
 */
export function importStoreResolver() {
  const customers = new Map<string, Promise<string | undefined>>();
  const stores = new Map<string, Promise<Store[]>>();
  const selectedStores = new Map<string, Promise<Store | null>>();
  async function customerId(name: string) {
    const key = storeIdentityText(name);
    if (!customers.has(key)) customers.set(key, (async () => {
      const matches: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db.from("customers").select("id,name").ilike("name", pattern(name)).order("id").range(offset, offset + 999);
        if (result.error) throw result.error;
        for (const row of result.data ?? []) if (storeIdentityText(row.name) === key) matches.push(row.id);
        if ((result.data?.length ?? 0) < 1000) break;
      }
      if (matches.length > 1) throw new ApiError(`Select the customer identity for ${name}; multiple customers match.`, 400);
      return matches[0];
    })());
    return customers.get(key)!;
  }
  async function matchingStores(customer: string, source: Destination) {
    const key = JSON.stringify([customer, storeIdentityText(source.ship_to)]);
    if (!stores.has(key)) stores.set(key, (async () => {
      const rows: Store[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db.from("customer_stores").select("id,customer_id,name,province,city").eq("customer_id", customer).ilike("name", pattern(source.ship_to)).order("id").range(offset, offset + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data ?? []).filter(row => storeIdentityText(row.name) === storeIdentityText(source.ship_to)));
        if ((result.data?.length ?? 0) < 1000) break;
      }
      return rows;
    })());
    return (await stores.get(key)!).filter(row => destinationLookupKey({ ship_to: row.name, province: row.province ?? "", city: row.city ?? "" }) === destinationLookupKey(source));
  }
  return async (source: Destination, decision: Decision): Promise<Decision> => {
    for (const field of ["province", "city"] as const) {
      if (source[field] && decision[field] && storeIdentityText(String(decision[field])) !== storeIdentityText(source[field])) {
        throw new ApiError(`The reviewed ${field} for ${source.ship_to} differs from its CSV location. Correct the mapped CSV value before importing.`, 400);
      }
    }
    const location = { ...source, province: source.province || String(decision.province ?? "").trim(), city: source.city || String(decision.city ?? "").trim() };
    const resolved = { ...decision, province: location.province, city: location.city };
    let customer = typeof decision.customer_id === "string" && decision.customer_id ? decision.customer_id : undefined;
    if (decision.store_id) {
      const id = String(decision.store_id);
      if (!selectedStores.has(id)) selectedStores.set(id, (async () => {
        const selected = await db.from("customer_stores").select("id,customer_id,name,province,city").eq("id", id).maybeSingle();
        if (selected.error) throw selected.error;
        return selected.data;
      })());
      const store = await selectedStores.get(id)!;
      if (!store || (customer && customer !== store.customer_id) || destinationLookupKey({ ship_to: store.name, province: store.province ?? "", city: store.city ?? "" }) !== destinationLookupKey(location)) {
        throw new ApiError(`The selected store does not match ${source.ship_to} / ${location.province || "Missing province"} / ${location.city || "Missing city"}. Select the matching branch or create this location.`, 400);
      }
      return { ...resolved, customer_id: store.customer_id };
    }
    customer ??= await customerId(source.customer_name ?? "");
    if (customer) {
      const matches = await matchingStores(customer, location);
      if (matches.length > 1) throw new ApiError(`Multiple store records match ${source.ship_to} / ${location.province} / ${location.city}. Select the correct store identity.`, 400);
      if (matches.length === 1) return { ...resolved, customer_id: customer, store_id: matches[0].id };
    }
    // Use a new namespace: older IMP codes removed punctuation from identities.
    // Exact legacy locations were already reused by ID above.
    return { ...resolved, ...(customer ? { customer_id: customer } : {}), store_code: `LOC-${createHash("sha256").update(destinationLookupKey(location)).digest("hex").slice(0, 20)}` };
  };
}
