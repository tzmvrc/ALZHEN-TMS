import type { RelationshipOption } from "../../services/lookup.service";
import type { CsvTripGroup } from "./tripCsv";

type Kind = "products" | "warehouses" | "stores" | "trucks" | "trip-types" | "customers";
type Options = Record<Exclude<Kind, "customers">, RelationshipOption[]> & { customers?: RelationshipOption[] };
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const fields: Record<Kind, string[]> = {
  products: ["model_code", "sku", "product_name"], warehouses: ["warehouse_code", "warehouse_name"],
  stores: ["store_name", "ship_to", "store_code"], trucks: ["plate_number"], "trip-types": ["trip_type"],
  customers: ["customer_name", "customer_code"],
};

function indexOptions(options: RelationshipOption[], kind: Kind) {
  const index = new Map<string, Map<string, RelationshipOption>>();
  for (const option of options) {
    for (const value of [option.id, option.label, ...fields[kind].map(field => option.values?.[field] ?? "")]) {
      const key = normalize(value);
      if (!key) continue;
      const matches = index.get(key) ?? new Map();
      matches.set(option.id, option); index.set(key, matches);
    }
  }
  return index;
}

/** Reuse local matches, search each missing value once, and cap in-flight requests. */
export async function resolveTripCsvLookups<T extends Options>(group: CsvTripGroup, current: T,
  search: (kind: Kind, value: string, customerId?: string) => Promise<RelationshipOption[]>,
  onProgress?: (completed: number, total: number) => void,
) {
  const kinds = Object.keys(fields) as Kind[];
  const lookups = { ...current, customers: current.customers ?? [] };
  const indexes = Object.fromEntries(kinds.map(kind => [kind, indexOptions(lookups[kind], kind)])) as Record<Kind, ReturnType<typeof indexOptions>>;
  const find = (kind: Kind, value: string, customerId?: string) => {
    const matches = [...(indexes[kind].get(normalize(value))?.values() ?? [])]
      .filter(option => !customerId || option.values?.customer_id === customerId);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const pending = new Map<string, { kind: Kind; value: string; customerId?: string }>();
  const enqueue = (kind: Kind, value: string, customerId?: string) => {
    if (value.trim() && !find(kind, value, customerId)) pending.set(`${kind}:${customerId ?? ""}:${normalize(value)}`, { kind, value, customerId });
  };
  const first = group.rows[0]?.values;
  if (first) { enqueue("warehouses", first.warehouse); enqueue("trip-types", first.tripType); }
  for (const { values } of group.rows) {
    enqueue("products", values.product); enqueue("customers", values.customer); enqueue("trucks", values.plate);
    if (!values.customer) enqueue("stores", values.store);
  }
  let cursor = 0, completed = 0, failed = false;
  let total = pending.size;
  const resolvePending = async () => {
    const tasks = [...pending.values()];
    pending.clear(); cursor = 0;
    const results: Array<{ kind: Kind; options: RelationshipOption[] }> = [];
    onProgress?.(completed, total);
    await Promise.all(Array.from({ length: Math.min(6, tasks.length) }, async () => {
      while (cursor < tasks.length && !failed) {
        const { kind, value, customerId } = tasks[cursor++];
        try {
          const options = await search(kind, value, customerId);
          results.push({ kind, options });
          onProgress?.(++completed, total);
        } catch (error) { failed = true; throw error; }
      }
    }));
    for (const kind of kinds) {
      const options = new Map(lookups[kind].map(option => [option.id, option]));
      for (const result of results) if (result.kind === kind) for (const option of result.options) options.set(option.id, option);
      lookups[kind] = [...options.values()];
      indexes[kind] = indexOptions(lookups[kind], kind);
    }
  };
  await resolvePending();
  // Resolve customers first so identical store names cannot select another customer's destination.
  for (const { values } of group.rows) {
    const customer = find("customers", values.customer);
    if (values.customer && customer) enqueue("stores", values.store, customer.id);
  }
  total += pending.size;
  if (pending.size) await resolvePending();
  return { lookups, find };
}
