import { apiGetCached, type ApiResponse } from "./api.service";

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

function stringValue(row: LookupRow, key: string) {
  return typeof row[key] === "string" ? (row[key] as string) : "";
}

function fullName(row: LookupRow) {
  return [stringValue(row, "first_name"), stringValue(row, "last_name")]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function toRelationshipOption(
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
        values: { plate_number: stringValue(row, "plate_number") },
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

export async function searchRelationshipOptions(
  token: string,
  kind: RelationshipKind,
  query: string,
  filters: { storeId?: string; customerId?: string } = {},
): Promise<RelationshipOption[]> {
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
  const response = await apiGetCached<ApiResponse<LookupRow[]>>(
    `${endpoint}${suffix}`,
    token,
    30_000,
  );
  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load relationship options.");
  }
  return [...new Map(response.data
    .map((row) => toRelationshipOption(kind, row))
    .filter((option): option is RelationshipOption => Boolean(option?.label))
    .map((option) => [option.id, option])).values()];
}
