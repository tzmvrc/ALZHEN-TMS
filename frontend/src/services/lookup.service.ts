import { apiGet, apiGetCached, getCachedApiResponse, type ApiResponse } from "./api.service";

export type RelationshipKind =
  | "trip-types"
  | "warehouses"
  | "customers"
  | "stores"
  | "products"
  | "drivers"
  | "trucks"
  | "trucking-companies"
  | "assignees"
  | "store-contacts";

export type RelationshipOption = {
  id: string;
  label: string;
  secondary?: string;
  values?: Record<string, string>;
};

type LookupRow = Record<string, unknown>;
// The API cache owns freshness/session isolation. Reuse only the projection of
// that exact response array; WeakMap entries disappear when it is evicted.
const projectedOptions=new WeakMap<LookupRow[],Map<RelationshipKind,RelationshipOption[]>>();
function relationshipOptions(kind:RelationshipKind,rows:LookupRow[]){
 let kinds=projectedOptions.get(rows);if(!kinds){kinds=new Map();projectedOptions.set(rows,kinds);}
 const cached=kinds.get(kind);if(cached)return cached;
 const options=[...new Map(rows.map(row=>toRelationshipOption(kind,row)).filter((option):option is RelationshipOption=>Boolean(option?.label)).map(option=>[option.id,option])).values()];
 kinds.set(kind,options);return options;
}

function stringValue(row: LookupRow, key: string) {
  return typeof row[key] === "string" ? (row[key] as string) : "";
}

function fullName(row: LookupRow) {
  return [stringValue(row, "first_name"), stringValue(row, "last_name")]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function toRelationshipOption(
  kind: RelationshipKind,
  row: LookupRow,
): RelationshipOption | null {
  const id = stringValue(row, "id");
  if (!id) return null;

  switch (kind) {
    case "trip-types":
      return {
        id,
        label: stringValue(row, "name"),
        secondary: stringValue(row, "code"),
        values: { trip_type: stringValue(row, "name") },
      };
    case "products":
      return {
        id,
        label: stringValue(row, "name") || stringValue(row, "sku"),
        secondary: [stringValue(row, "sku"), stringValue(row, "model_code")]
          .filter(Boolean)
          .join(" · "),
        values: {
          product_name: stringValue(row, "name"),
          sku: stringValue(row, "sku"),
          model_code: stringValue(row, "model_code"),
          product_model: stringValue(row, "model_code"),
          category: stringValue(row, "category"),
          product_category: stringValue(row, "category"),
        },
      };
    case "warehouses":
      return {
        id,
        label: stringValue(row, "name") || stringValue(row, "code"),
        secondary: stringValue(row, "code"),
        values: {
          warehouse_name: stringValue(row, "name"),
          warehouse_code: stringValue(row, "code"),
          ship_from: stringValue(row, "name"),
        },
      };
    case "customers":
      return {
        id,
        label: stringValue(row, "name"),
        secondary: stringValue(row, "code"),
        values: {
          customer_name: stringValue(row, "name"),
          customer_code: stringValue(row, "code"),
        },
      };
    case "stores":
      return {
        id,
        label: stringValue(row, "name"),
        secondary: [stringValue(row, "code"), stringValue(row, "city")]
          .filter(Boolean)
          .join(" · "),
        values: {
          customer_id: stringValue(row, "customer_id"),
          store_name: stringValue(row, "name"),
          store_code: stringValue(row, "code"),
          latitude: row.latitude == null ? "" : String(row.latitude),
          longitude: row.longitude == null ? "" : String(row.longitude),
          location_verified: row.location_verified === true ? "true" : "false",
          ship_to: stringValue(row, "name"),
          city: stringValue(row, "city"),
          province: stringValue(row, "province"),
          address: stringValue(row, "address"),
        },
      };
    case "drivers":
      return {
        id,
        label: stringValue(row, "full_name") || fullName(row),
        secondary:
          stringValue(row, "contact_number") ||
          stringValue(row, "trucking_company_name"),
        values: { driver_name: stringValue(row, "full_name") || fullName(row) },
      };
    case "trucks":
      return {
        id,
        label: stringValue(row, "plate_number"),
        secondary: [
          stringValue(row, "truck_type"),
          stringValue(row, "trucking_company_name"),
        ]
          .filter(Boolean)
          .join(" · "),
        values: {
          default_driver_id: stringValue(row,"default_driver_id"),
          default_driver_name: stringValue(row,"default_driver_name"),
          default_driver_ambiguous: row.default_driver_ambiguous ? "true" : "false",
          plate_number: stringValue(row, "plate_number"),
          truck_type: stringValue(row, "truck_type"),
          capacity_cbm: row.capacity_cbm == null ? "" : String(row.capacity_cbm),
          trucking_company_id: stringValue(row, "trucking_company_id"),
          trucking_company_name: stringValue(row, "trucking_company_name"),
        },
      };
    case "trucking-companies":
      return {
        id,
        label: stringValue(row, "name"),
        secondary: stringValue(row, "code"),
        values: {
          trucking_company: stringValue(row, "name"),
        },
      };
    case "assignees":
      return {
        id,
        label: stringValue(row, "full_name") || fullName(row),
        secondary: stringValue(row, "role"),
        values: {
          assigned_to: stringValue(row, "full_name") || fullName(row),
          assigned_to_name: stringValue(row, "full_name") || fullName(row),
        },
      };
    case "store-contacts":
      return {
        id,
        label: stringValue(row, "name"),
        secondary: [stringValue(row, "position"), stringValue(row, "phone")]
          .filter(Boolean)
          .join(" · "),
      };
  }
}

/** Next dispatch reference for a day, with a separate generated trip reference. Never cached. */
export async function getNextDispatchNumber(token: string, prefix: string): Promise<string> {
  return (await getNextTripReferences(token, prefix)).dispatch_number;
}

export async function getNextTripReferences(token: string, prefix: string): Promise<{ dispatch_number: string; trip_reference: string | null; trip_reference_status: "ready" | "setup_required" | "unavailable" }> {
  const response = await apiGet<ApiResponse<{ dispatch_number: string; trip_reference?: string | null; trip_reference_status?: "ready" | "setup_required" | "unavailable" }>>(
    `/trips/next-dispatch-number?prefix=${encodeURIComponent(prefix)}`,
    token,
    15_000,
  );
  if (!response.success || !response.data?.dispatch_number) {
    throw new Error(response.message ?? "Could not generate the dispatch reference.");
  }
  return { dispatch_number: response.data.dispatch_number, trip_reference: response.data.trip_reference ?? null, trip_reference_status: response.data.trip_reference_status ?? (response.data.trip_reference ? "ready" : "unavailable") };
}

export type DispatchOption = {
  dispatch_number: string;
  trip_count: number;
  next_trip_number: number;
  loading_date: string | null;
  warehouse_id: string | null;
  trip_type_id: string | null;
};

/** Existing dispatches (newest first) so a new trip can be added to one. Never cached. */
export async function searchDispatches(token: string, query = ""): Promise<DispatchOption[]> {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const response = await apiGet<ApiResponse<DispatchOption[]>>(`/trips/dispatches${suffix}`, token, 15_000);
  if (!response.success || !response.data) throw new Error(response.message ?? "Could not load dispatches.");
  return response.data;
}

function relationshipEndpoint(kind:RelationshipKind,query:string,filters:{storeId?:string;customerId?:string}={}){
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (
    kind === "trip-types" ||
    kind === "warehouses" ||
    kind === "customers" ||
    kind === "stores" ||
    kind === "products" ||
    kind === "drivers" ||
    kind === "trucks" ||
    kind === "trucking-companies"
  ) {
    params.set("status", "ACTIVE");
  }
  if (kind === "store-contacts" && filters.storeId) {
    params.set("store_id", filters.storeId);
  }
  if (kind === "stores" && filters.customerId) {
    params.set("customer_id", filters.customerId);
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  const endpoint = kind === "assignees" ? "/lookups/assignees" : `/lookups/${kind}`;
  return `${endpoint}${suffix}`;
}
export function getCachedRelationshipOptions(token:string,kind:RelationshipKind,query="",filters:{storeId?:string;customerId?:string}={}){
 const cached=getCachedApiResponse<ApiResponse<LookupRow[]>>(relationshipEndpoint(kind,query,filters),token,30000);
 return cached?.success&&cached.data?relationshipOptions(kind,cached.data):null;
}
export async function searchRelationshipOptions(
  token: string,
  kind: RelationshipKind,
  query: string,
  filters: { storeId?: string; customerId?: string } = {},
): Promise<RelationshipOption[]> {
  const endpoint=relationshipEndpoint(kind,query,filters);
  const response = await apiGetCached<ApiResponse<LookupRow[]>>(
    endpoint,
    token,
    30_000,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load relationship options.");
  }
  return relationshipOptions(kind,response.data);
}
export type TruckAvailability={id:string;plate_number:string;truck_type:string|null;capacity_cbm:number|null;available_cbm:number|null;availability:"AVAILABLE"|"CONFLICT"|"REVIEW";reason:string};
export type DriverAvailability={id:string;availability:"AVAILABLE"|"CONFLICT"|"REVIEW";reason:string};
export async function fetchDriverAvailability(token:string,start:string,end:string,excludeTripId?:string):Promise<DriverAvailability[]>{const query=new URLSearchParams();if(start)query.set("start",start);if(end)query.set("end",end);if(excludeTripId)query.set("exclude_trip_id",excludeTripId);const response=await apiGet<ApiResponse<DriverAvailability[]>>(`/trips/driver-availability?${query}`,token);if(!response.success||!response.data)throw Error(response.message??"Unable to check driver schedules.");return response.data;}
export async function fetchTruckAvailability(token:string,start:string,end:string,excludeTripId?:string):Promise<TruckAvailability[]>{
 const query=new URLSearchParams();if(start)query.set("start",start);if(end)query.set("end",end);if(excludeTripId)query.set("exclude_trip_id",excludeTripId);
 const response=await apiGet<ApiResponse<TruckAvailability[]>>(`/trips/truck-availability?${query}`,token);
 if(!response.success||!response.data)throw new Error("Unable to check truck availability.");return response.data;
}
