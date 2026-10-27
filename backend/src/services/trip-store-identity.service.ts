import { createHash } from "node:crypto";
import { supabaseAdmin as db } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { destinationLookupKey, storeIdentityText, type Destination } from "./trip-location.logic.js";

type Decision = Record<string, unknown>;
type Store = { id: string; customer_id: string; name: string; province: string | null; city: string | null };
type Customer = { id: string; name: string; code: string | null; status: string | null };
const pattern = (name: string) => name.trim().split(/\s+/).map(part => part.replace(/[\\%_]/g, "\\$&")).join("%");
const matchesLocation = (store: Store, source: Destination) => storeIdentityText(store.name) === storeIdentityText(source.ship_to)
  && (["province", "city"] as const).every(field => !source[field] || storeIdentityText(store[field]) === storeIdentityText(source[field]));
const knownGeography = (store: Store, decision: Decision): Decision => ({ ...decision,
  province: decision.province || store.province || "", city: decision.city || store.city || "" });

/** Resolve by an exact customer code/name or a unique existing store relationship.
 * Cross-customer store inference requires both province and city.
 * New locations use the existing RPC's customer-scoped code identity so the
 * installed resolver can create same-name branches without a schema change.
 */
export function importStoreResolver() {
  const customers = new Map<string, Promise<string | undefined>>();
  const stores = new Map<string, Promise<Store[]>>();
  const storesByLocation = new Map<string, Promise<Store[]>>();
  const selectedStores = new Map<string, Promise<Store | null>>();
  const selectedCustomers = new Map<string, Promise<Customer | null>>();
  async function activeCustomer(id: string) {
    if (!selectedCustomers.has(id)) selectedCustomers.set(id, (async () => {
      const result = await db.from("customers").select("id,name,code,status").eq("id", id).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    })());
    const selected = await selectedCustomers.get(id)!;
    if (!selected || ["INACTIVE", "DISABLED", "RETIRED"].includes(selected.status ?? "")) throw new ApiError("The matched customer is unavailable. Choose an active customer.", 400);
    return selected;
  }
  async function customerId(name: string, code = "") {
    const key = JSON.stringify([storeIdentityText(name), storeIdentityText(code)]);
    if (!customers.has(key)) customers.set(key, (async () => {
      const matches = new Map<string, Customer>();
      const explicitCodeMatches = new Map<string, Customer>();
      for (const [field, value] of [["code", code || name], ["name", name]] as const) {
        if (!value.trim()) continue;
        for (let offset = 0; ; offset += 1000) {
          const result = await db.from("customers").select("id,name,code,status").ilike(field, pattern(value)).order("id").range(offset, offset + 999);
          if (result.error) throw result.error;
          for (const row of result.data ?? []) if (storeIdentityText(row[field]) === storeIdentityText(value)) { matches.set(row.id, row); if (field === "code" && code) explicitCodeMatches.set(row.id, row); }
          if ((result.data?.length ?? 0) < 1000) break;
        }
      }
      if ([...explicitCodeMatches.values()].some(match => storeIdentityText(match.name) !== storeIdentityText(name) && storeIdentityText(match.code) !== storeIdentityText(name))) throw new ApiError(`Customer code ${code} belongs to another customer. Select that customer explicitly or enter another code.`, 400);
      if (matches.size > 1) return undefined;
      const match = [...matches.values()][0];
      if (match && ["INACTIVE", "DISABLED", "RETIRED"].includes(match.status ?? "")) throw new ApiError(`${match.name} is inactive. Select an active customer.`, 400);
      return match?.id;
    })());
    return customers.get(key)!;
  }
  async function matchingStoresAcrossCustomers(source: Destination) {
    if (!source.province.trim() || !source.city.trim()) return [];
    const key = destinationLookupKey(source);
    if (!storesByLocation.has(key)) storesByLocation.set(key, (async () => {
      const rows: Store[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db.from("customer_stores").select("id,customer_id,name,province,city").eq("status", "ACTIVE").ilike("name", pattern(source.ship_to)).order("id").range(offset, offset + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data ?? []).filter(row => matchesLocation(row, source)));
        if ((result.data?.length ?? 0) < 1000) break;
      }
      return rows;
    })());
    return storesByLocation.get(key)!;
  }
  async function matchingStores(customer: string, source: Destination) {
    const key = JSON.stringify([customer, storeIdentityText(source.ship_to)]);
    if (!stores.has(key)) stores.set(key, (async () => {
      const rows: Store[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db.from("customer_stores").select("id,customer_id,name,province,city").eq("status", "ACTIVE").eq("customer_id", customer).ilike("name", pattern(source.ship_to)).order("id").range(offset, offset + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data ?? []).filter(row => storeIdentityText(row.name) === storeIdentityText(source.ship_to)));
        if ((result.data?.length ?? 0) < 1000) break;
      }
      return rows;
    })());
    return (await stores.get(key)!).filter(row => matchesLocation(row, source));
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
    const code = typeof decision.customer_code === "string" ? decision.customer_code.trim() : "";
    if (customer) await activeCustomer(customer);
    if (decision.store_id) {
      const id = String(decision.store_id);
      if (!selectedStores.has(id)) selectedStores.set(id, (async () => {
        const selected = await db.from("customer_stores").select("id,customer_id,name,province,city").eq("status", "ACTIVE").eq("id", id).maybeSingle();
        if (selected.error) throw selected.error;
        return selected.data;
      })());
      const store = await selectedStores.get(id)!;
      if (!store || (customer && customer !== store.customer_id) || !matchesLocation(store, location)) {
        throw new ApiError(`The selected store does not match ${source.ship_to} / ${location.province || "Missing province"} / ${location.city || "Missing city"}. Select the matching branch or create this location.`, 400);
      }
      await activeCustomer(store.customer_id);
      return knownGeography(store, { ...resolved, customer_id: store.customer_id });
    }
    customer ??= await customerId(source.customer_name ?? "", code);
    if (!customer && !code) {
      // A unique exact destination and geography can identify its owning
      // customer. Ambiguous branches need an explicit choice.
      const candidates = await matchingStoresAcrossCustomers(location);
      if (candidates.length === 1) {
        const store = candidates[0];
        await activeCustomer(store.customer_id);
        return knownGeography(store, { ...resolved, customer_id: store.customer_id, store_id: store.id });
      }
      if (candidates.length > 1) throw new ApiError(`Several customers own a matching ${source.ship_to} destination. Select the customer and store.`, 400);
    }
    if (customer) {
      const matches = await matchingStores(customer, location);
      if (matches.length > 1) throw new ApiError(`Multiple store records match ${source.ship_to} / ${location.province} / ${location.city}. Select the correct store identity.`, 400);
      if (matches.length === 1) return knownGeography(matches[0], { ...resolved, customer_id: customer, store_id: matches[0].id });
    }
    // Use a new namespace: older IMP codes removed punctuation from identities.
    // Exact legacy locations were already reused by ID above.
    return { ...resolved, ...(customer ? { customer_id: customer } : {}), store_code: `LOC-${createHash("sha256").update(destinationLookupKey(location)).digest("hex").slice(0, 20)}` };
  };
}
