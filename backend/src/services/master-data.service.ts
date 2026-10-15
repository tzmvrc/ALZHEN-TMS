import { supabaseAdmin } from "../config/supabase.js";
import { buildIlikeOrFilter } from "../utils/postgrest-search.js";

export type MasterDataResource = "warehouses" | "trucks" | "stores" | "store-contacts" | "products";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const configs = {
  warehouses: {
    table: "warehouses",
    select: "id, code, name, address, province, city, latitude, longitude, warehouse_type, status, notes, region, created_at, updated_at",
    orderBy: "name",
    search: ["code", "name", "city", "province", "region"],
    fields: ["code", "name", "address", "province", "city", "latitude", "longitude", "warehouse_type", "status", "notes", "region"],
    required: ["code", "name"],
    types: { code: "text", name: "text", address: "nullable", province: "nullable", city: "nullable", latitude: "coordinate", longitude: "coordinate", warehouse_type: "nullable", status: "nullable", notes: "nullable", region: "region" },
  },
  trucks: {
    table: "trucks",
    select: "id, plate_number, trucking_company_id, truck_type, capacity_cbm, status, notes, created_at, updated_at, trucking_companies(id, name)",
    orderBy: "plate_number",
    search: ["plate_number", "truck_type", "status"],
    fields: ["plate_number", "trucking_company_id", "truck_type", "capacity_cbm", "status", "notes"],
    required: ["plate_number"],
    types: { plate_number: "text", trucking_company_id: "uuid", truck_type: "nullable", capacity_cbm: "number", status: "nullable", notes: "nullable" },
  },
  stores: {
    table: "customer_stores",
    select: "id, customer_id, name, code, address, province, city, postal_code, latitude, longitude, status, notes, region, created_at, updated_at, customers(id, name, code)",
    orderBy: "name",
    search: ["name", "code", "city", "province", "region"],
    fields: ["customer_id", "name", "code", "address", "province", "city", "postal_code", "latitude", "longitude", "status", "notes", "region"],
    required: ["customer_id", "name"],
    types: { customer_id: "uuid", name: "text", code: "nullable", address: "nullable", province: "nullable", city: "nullable", postal_code: "nullable", latitude: "coordinate", longitude: "coordinate", status: "nullable", notes: "nullable", region: "nullable" },
  },
  "store-contacts": {
    table: "store_contacts",
    select: "id, store_id, name, phone, email, position, is_primary, notes, created_at, updated_at, customer_stores(id, name, code, customer_id)",
    orderBy: "name",
    search: ["name", "phone", "email", "position"],
    fields: ["store_id", "name", "phone", "email", "position", "is_primary", "notes"],
    required: ["store_id", "name"],
    types: { store_id: "uuid", name: "text", phone: "nullable", email: "nullable", position: "nullable", is_primary: "boolean", notes: "nullable" },
  },
  products: {
    table: "products",
    select: "id, sku, model_code, name, category, description, unit_cbm, status, notes, photo_path, created_at, updated_at",
    orderBy: "name",
    search: ["sku", "model_code", "name", "category"],
    fields: ["sku", "model_code", "name", "category", "description", "unit_cbm", "status", "notes"],
    required: ["name"],
    types: { sku: "nullable", model_code: "nullable", name: "text", category: "nullable", description: "nullable", unit_cbm: "number", status: "text", notes: "nullable" },
  },
} as const;

function getConfig(resource: string) {
  if (!(resource in configs)) throw new Error("Unknown master-data resource.");
  return configs[resource as MasterDataResource];
}

export async function listMasterData(resource: string, query: Record<string, unknown>) {
  const config = getConfig(resource);
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 50)));
  const from = (page - 1) * limit;
  let builder = (supabaseAdmin.from(config.table) as any).select(config.select, { count: "exact" }).order(config.orderBy, { ascending: true }).range(from, from + limit - 1);
  const searchFilter = buildIlikeOrFilter(config.search, query.search);
  if (searchFilter) builder = builder.or(searchFilter);
  if (resource === "store-contacts" && typeof query.store_id === "string" && uuidPattern.test(query.store_id)) builder = builder.eq("store_id", query.store_id);
  const { data, error, count } = await builder;
  if (error) {
    console.error("Master-data list query failed:", { resource, error });
    throw new Error("Unable to load master data.");
  }
  return { rows: data ?? [], pagination: { page, limit, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) } };
}

async function validateRelationship(table: string, id: unknown, field: string) {
  if (id === undefined || id === null || id === "") return null;
  if (typeof id !== "string" || !uuidPattern.test(id)) throw new Error(`${field} must be a valid record.`);
  const { data, error } = await supabaseAdmin.from(table).select("id").eq("id", id).maybeSingle();
  if (error || !data) throw new Error(`${field} references a record that does not exist.`);
  return id;
}

function buildPayload(resource: string, input: Record<string, unknown>, creating: boolean) {
  const config = getConfig(resource);
  const unknown = Object.keys(input).filter((field) => !(config.fields as readonly string[]).includes(field));
  if (unknown.length) throw new Error(`Unsupported field(s): ${unknown.join(", ")}.`);
  if (creating) {
    const missing = config.required.filter((field) => typeof input[field] !== "string" || !String(input[field]).trim());
    if (missing.length) throw new Error(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`);
  }
  const payload: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(input)) {
    if (raw === undefined) continue;
    const type = config.types[field as keyof typeof config.types] as string | undefined;
    if (type === "text" || type === "nullable") {
      if (raw === null && type === "nullable") { payload[field] = null; continue; }
      if (typeof raw !== "string") throw new Error(`${field} must be text.`);
      const value = raw.trim();
      if (!value && type === "text") throw new Error(`${field} cannot be empty.`);
      payload[field] = value || null;
    } else if (type === "uuid") {
      if (raw === null || raw === "") { payload[field] = null; continue; }
      if (typeof raw !== "string" || !uuidPattern.test(raw)) throw new Error(`${field} must be a valid record.`);
      payload[field] = raw;
    } else if (type === "number" || type === "coordinate") {
      if (raw === null || raw === "") { payload[field] = null; continue; }
      const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
      if (!Number.isFinite(value)) throw new Error(`${field} must be a number.`);
      if (type === "number" && value < 0) throw new Error(`${field} cannot be negative.`);
      if (type === "coordinate" && (field === "latitude" ? value < -90 || value > 90 : value < -180 || value > 180)) throw new Error(`${field} is outside the valid coordinate range.`);
      payload[field] = value;
    } else if (type === "boolean") {
      if (typeof raw !== "boolean") throw new Error(`${field} must be true or false.`);
      payload[field] = raw;
    } else if (type === "region") {
      if (raw === null || raw === "") { payload[field] = null; continue; }
      if (typeof raw !== "string" || !["LUZON", "VISAYAS", "MINDANAO"].includes(raw)) {
        throw new Error(`${field} must be LUZON, VISAYAS, or MINDANAO.`);
      }
      payload[field] = raw;
    }
  }
  return payload;
}

async function validatePayloadRelationships(resource: string, payload: Record<string, unknown>) {
  if (resource === "stores" && payload.customer_id !== undefined) payload.customer_id = await validateRelationship("customers", payload.customer_id, "customer_id");
  if (resource === "trucks" && payload.trucking_company_id !== undefined) payload.trucking_company_id = await validateRelationship("trucking_companies", payload.trucking_company_id, "trucking_company_id");
  if (resource === "store-contacts" && payload.store_id !== undefined) payload.store_id = await validateRelationship("customer_stores", payload.store_id, "store_id");
}

export async function saveMasterData(resource: string, input: Record<string, unknown>, id?: string) {
  const creating = !id;
  if (id && !uuidPattern.test(id)) throw new Error("Invalid master-data record id.");
  const config = getConfig(resource);
  const payload = buildPayload(resource, input, creating);
  if (!Object.keys(payload).length) throw new Error("Enter at least one field to save.");
  await validatePayloadRelationships(resource, payload);
  const table = supabaseAdmin.from(config.table) as any;
  const builder = creating
    ? table.insert(payload)
    : table.update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id!);
  const { data, error } = await builder.select(config.select).single();
  if (error) {
    console.error("Master-data save failed:", { resource, id, error });
    if (error.code === "23505") throw new Error("A record with this identifier already exists.");
    if (error.code === "23503") throw new Error("A related master-data record is no longer available.");
    if (error.code === "23514") throw new Error("One of the entered values is not allowed.");
    throw new Error("Unable to save this master-data record.");
  }
  return data;
}
