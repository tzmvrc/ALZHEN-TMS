import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { normalizeSortOrder, normalizeText } from "../utils/validation.js";
import type {
  DriverOption,
  IncidentReasonOption,
  LookupQueryParams,
  ProductOption,
  ProfileOption,
  StoreContactOption,
  StoreOption,
  TripTypeOption,
  TruckOption,
  TruckingCompanyOption,
  WarehouseOption,
  CustomerOption,
} from "../types/lookup.types.js";

const LOOKUP_DEFAULT_LIMIT = 500;

function normalizeFilterValue(value: string | undefined) {
  return normalizeText(value);
}

function buildOrderClause(
  sortBy: string | undefined,
  defaultSort: string,
  allowedSorts: string[],
  sortOrder: string,
) {
  const resolvedSort =
    sortBy && allowedSorts.includes(sortBy) ? sortBy : defaultSort;
  return {
    sortBy: resolvedSort,
    sortOrder: normalizeSortOrder(sortOrder, "asc"),
  };
}

function applySearch(
  queryBuilder: any,
  q: string | undefined,
  columns: string[],
) {
  if (!q || columns.length === 0) {
    return queryBuilder;
  }

  const cleaned = q.trim();
  if (!cleaned) {
    return queryBuilder;
  }

  return queryBuilder.or(
    columns.map((column) => `${column}.ilike.%${cleaned}%`).join(","),
  );
}

function applyStatusFlag(
  queryBuilder: any,
  statusValue: string | undefined,
  field: string,
  useBoolean = false,
) {
  const value = normalizeFilterValue(statusValue);
  if (!value) {
    return queryBuilder;
  }

  if (useBoolean) {
    const normalized = value.toUpperCase();
    if (normalized === "ACTIVE") return queryBuilder.eq(field, true);
    if (normalized === "INACTIVE") return queryBuilder.eq(field, false);
    return queryBuilder;
  }

  return queryBuilder.eq(field, value);
}

function applyRoleFilter(queryBuilder: any, roleValue: string | undefined) {
  const value = normalizeFilterValue(roleValue);
  if (!value) return queryBuilder;
  return queryBuilder.eq("role", value.toUpperCase());
}

async function getCompanyNameMap(companyIds: string[]) {
  if (companyIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabaseAdmin
    .from("trucking_companies")
    .select("id, name")
    .in("id", companyIds);

  if (error) {
    throw new ApiError(
      "Unable to load trucking company names",
      500,
      "LOOKUP_QUERY_FAILED",
    );
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row?.id) {
      map.set(String(row.id), String(row.name ?? ""));
    }
  }

  return map;
}

export async function getTripTypes(
  query: LookupQueryParams = {},
): Promise<TripTypeOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["code", "name", "created_at"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("trip_types")
    .select("id, code, name, description, active");

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, ["code", "name"]);
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "active", true);
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError(
      "Unable to fetch trip types",
      500,
      "LOOKUP_QUERY_FAILED",
    );
  }

  return (data ?? []) as TripTypeOption[];
}

export async function getWarehouses(
  query: LookupQueryParams = {},
): Promise<WarehouseOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["code", "name", "region", "province", "city"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("warehouses")
    .select(
      "id, code, name, region, province, city, address, warehouse_type, status",
    );

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "code",
      "name",
      "region",
      "province",
      "city",
    ]);
  }

  const regionValue = normalizeFilterValue(query.region);
  if (regionValue) {
    queryBuilder = queryBuilder.eq("region", regionValue.toUpperCase());
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "status");
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError(
      "Unable to fetch warehouses",
      500,
      "LOOKUP_QUERY_FAILED",
    );
  }

  return (data ?? []) as WarehouseOption[];
}

export async function getCustomers(
  query: LookupQueryParams = {},
): Promise<CustomerOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["code", "name", "contact_person", "status"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("customers")
    .select("id, code, name, contact_person, contact_number, email, status");

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "code",
      "name",
      "contact_person",
    ]);
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "status");
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError("Unable to fetch customers", 500, "LOOKUP_QUERY_FAILED");
  }

  return (data ?? []) as CustomerOption[];
}

export async function getStores(
  query: LookupQueryParams = {},
): Promise<StoreOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["code", "name", "city", "province", "region", "customer_id"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("customer_stores")
    .select(
      "id, customer_id, code, name, region, province, city, address, status",
    );

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "code",
      "name",
      "city",
      "province",
      "region",
    ]);
  }

  const customerId = normalizeFilterValue(query.customer_id);
  if (customerId) {
    queryBuilder = queryBuilder.eq("customer_id", customerId);
  }

  const regionValue = normalizeFilterValue(query.region);
  if (regionValue) {
    queryBuilder = queryBuilder.eq("region", regionValue.toUpperCase());
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "status");
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError("Unable to fetch stores", 500, "LOOKUP_QUERY_FAILED");
  }

  return (data ?? []) as StoreOption[];
}

export async function getProducts(
  query: LookupQueryParams = {},
): Promise<ProductOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["sku", "model_code", "name", "category", "status"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("products")
    .select("id, sku, model_code, name, category, unit_cbm, status");

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "sku",
      "model_code",
      "name",
      "category",
    ]);
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "status");
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError("Unable to fetch products", 500, "LOOKUP_QUERY_FAILED");
  }

  return (data ?? []) as ProductOption[];
}

export async function getDrivers(
  query: LookupQueryParams = {},
): Promise<DriverOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "last_name",
    ["first_name", "last_name", "status", "contact_number"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("drivers")
    .select(
      "id, profile_id, first_name, last_name, contact_number, status, trucking_company_id, trucking_companies(id, name)",
    );

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "first_name",
      "last_name",
      "contact_number",
    ]);
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "status");
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError("Unable to fetch drivers", 500, "LOOKUP_QUERY_FAILED");
  }

  const companyIds = [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.trucking_company_id ?? ""))
        .filter(Boolean),
    ),
  ];
  const companyNameMap = await getCompanyNameMap(companyIds);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const fullName =
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
      "Unnamed driver";
    const companyId =
      typeof row.trucking_company_id === "string"
        ? row.trucking_company_id
        : null;

    return {
      id: String(row.id),
      profile_id: typeof row.profile_id === "string" ? row.profile_id : null,
      first_name: typeof row.first_name === "string" ? row.first_name : null,
      last_name: typeof row.last_name === "string" ? row.last_name : null,
      full_name: fullName,
      contact_number:
        typeof row.contact_number === "string" ? row.contact_number : null,
      status: typeof row.status === "string" ? row.status : null,
      trucking_company_id: companyId,
      trucking_company_name: companyId
        ? (companyNameMap.get(companyId) ?? null)
        : null,
    } as DriverOption;
  });
}

export async function getTrucks(
  query: LookupQueryParams = {},
): Promise<TruckOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "plate_number",
    ["plate_number", "truck_type", "capacity_cbm", "status"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("trucks")
    .select(
      "id, plate_number, truck_type, capacity_cbm, status, trucking_company_id, trucking_companies(id, name)",
    );

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "plate_number",
      "truck_type",
      "status",
    ]);
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "status");
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError("Unable to fetch trucks", 500, "LOOKUP_QUERY_FAILED");
  }

  const companyIds = [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.trucking_company_id ?? ""))
        .filter(Boolean),
    ),
  ];
  const companyNameMap = await getCompanyNameMap(companyIds);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const companyId =
      typeof row.trucking_company_id === "string"
        ? row.trucking_company_id
        : null;
    return {
      id: String(row.id),
      plate_number:
        typeof row.plate_number === "string" ? row.plate_number : null,
      truck_type: typeof row.truck_type === "string" ? row.truck_type : null,
      capacity_cbm:
        typeof row.capacity_cbm === "number" ? row.capacity_cbm : null,
      status: typeof row.status === "string" ? row.status : null,
      trucking_company_id: companyId,
      trucking_company_name: companyId
        ? (companyNameMap.get(companyId) ?? null)
        : null,
    } as TruckOption;
  });
}

export async function getTruckingCompanies(
  query: LookupQueryParams = {},
): Promise<TruckingCompanyOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["code", "name", "status"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("trucking_companies")
    .select("id, code, name, contact_person, contact_number, email, status");

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "code",
      "name",
      "contact_person",
    ]);
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "status");
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError(
      "Unable to fetch trucking companies",
      500,
      "LOOKUP_QUERY_FAILED",
    );
  }

  return (data ?? []) as TruckingCompanyOption[];
}

export async function getProfiles(
  query: LookupQueryParams = {},
): Promise<ProfileOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "last_name",
    ["first_name", "last_name", "role"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role, is_admin, profile_picture_path");

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "first_name",
      "last_name",
      "role",
    ]);
  }

  const roleValue = normalizeFilterValue(query.role);
  if (roleValue) {
    queryBuilder = applyRoleFilter(queryBuilder, roleValue);
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError("Unable to fetch profiles", 500, "LOOKUP_QUERY_FAILED");
  }

  return Promise.all(((data ?? []) as Record<string, unknown>[]).map(async (row) => {
    const fullName =
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
      "Unnamed profile";
    const picturePath = typeof row.profile_picture_path === "string" ? row.profile_picture_path : null;
    let profilePictureUrl = picturePath && /^https?:\/\//i.test(picturePath) ? picturePath : null;
    if (picturePath && !profilePictureUrl) {
      try {
        const { data: signed } = await supabaseAdmin.storage.from("profile-pictures").createSignedUrl(picturePath, 60 * 60);
        profilePictureUrl = signed?.signedUrl ?? null;
      } catch { /* retain the profile listing if its private image is unavailable */ }
    }
    return {
      id: String(row.id),
      first_name: typeof row.first_name === "string" ? row.first_name : null,
      last_name: typeof row.last_name === "string" ? row.last_name : null,
      full_name: fullName,
      role: typeof row.role === "string" ? row.role : null,
      is_admin: typeof row.is_admin === "boolean" ? row.is_admin : null,
      profile_picture_url: profilePictureUrl,
    } as ProfileOption;
  }));
}

export async function getEligibleAssignees(
  query: LookupQueryParams = {},
): Promise<ProfileOption[]> {
  let profileQuery = supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role, is_admin")
    .in("role", ["ADMIN", "STAFF"]);

  if (query.q) {
    profileQuery = applySearch(profileQuery, query.q, [
      "first_name",
      "last_name",
    ]);
  }

  const { data: profiles, error } = await profileQuery
    .order("last_name", { ascending: true })
    .limit(500);
  if (error) {
    throw new ApiError(
      "Unable to fetch eligible assignees",
      500,
      "LOOKUP_QUERY_FAILED",
    );
  }

  const activeAuthIds = new Set<string>();
  let page = 1;
  while (true) {
    const { data, error: authError } = await supabaseAdmin.auth.admin.listUsers(
      { page, perPage: 1000 },
    );
    if (authError) {
      throw new ApiError(
        "Unable to verify assignee accounts",
        500,
        "LOOKUP_QUERY_FAILED",
      );
    }

    for (const user of data.users) {
      const isDeleted = "deleted_at" in user && Boolean(user.deleted_at);
      if (!user.banned_until && !isDeleted) activeAuthIds.add(user.id);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }

  return ((profiles ?? []) as Record<string, unknown>[])
    .filter((profile) => activeAuthIds.has(String(profile.id)))
    .map((profile) => {
      const fullName =
        [profile.first_name, profile.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || "Unnamed profile";
      return {
        id: String(profile.id),
        first_name:
          typeof profile.first_name === "string" ? profile.first_name : null,
        last_name:
          typeof profile.last_name === "string" ? profile.last_name : null,
        full_name: fullName,
        role: typeof profile.role === "string" ? profile.role : null,
        is_admin:
          typeof profile.is_admin === "boolean" ? profile.is_admin : null,
      };
    });
}

export async function assertEligibleAssignee(profileId: string) {
  if (!isValidLookupUuid(profileId)) {
    throw new Error("assigned_to must be a valid profile UUID.");
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", profileId)
    .in("role", ["ADMIN", "STAFF"])
    .maybeSingle();
  if (error) {
    throw new Error("Unable to validate the assigned user.");
  }
  if (!profile) {
    throw new Error("Assigned user must be an admin or staff profile.");
  }

  const { data, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(profileId);
  const user = data?.user;
  const isDeleted = user && "deleted_at" in user && Boolean(user.deleted_at);
  if (authError || !user || user.banned_until || isDeleted) {
    throw new Error("Assigned user must have an active account.");
  }
}

function isValidLookupUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getStoreContacts(
  query: LookupQueryParams = {},
): Promise<StoreContactOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["name", "phone", "position", "is_primary"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("store_contacts")
    .select("id, store_id, name, phone, email, position, is_primary");

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, [
      "name",
      "phone",
      "email",
      "position",
    ]);
  }

  const storeId = normalizeFilterValue(query.store_id);
  if (storeId) {
    queryBuilder = queryBuilder.eq("store_id", storeId);
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError(
      "Unable to fetch store contacts",
      500,
      "LOOKUP_QUERY_FAILED",
    );
  }

  return (data ?? []) as StoreContactOption[];
}

export async function getIncidentReasons(
  query: LookupQueryParams = {},
): Promise<IncidentReasonOption[]> {
  const { sortBy, sortOrder } = buildOrderClause(
    query.sort_by,
    "name",
    ["code", "name", "active"],
    query.sort_order ?? "asc",
  );

  let queryBuilder = supabaseAdmin
    .from("incident_reasons")
    .select("id, code, name, description, active");

  if (query.q) {
    queryBuilder = applySearch(queryBuilder, query.q, ["code", "name"]);
  }

  const statusValue = normalizeFilterValue(query.status);
  if (statusValue) {
    queryBuilder = applyStatusFlag(queryBuilder, statusValue, "active", true);
  }

  queryBuilder = queryBuilder.order(sortBy, { ascending: sortOrder === "asc" });
  queryBuilder = queryBuilder.limit(LOOKUP_DEFAULT_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) {
    throw new ApiError(
      "Unable to fetch incident reasons",
      500,
      "LOOKUP_QUERY_FAILED",
    );
  }

  return (data ?? []) as IncidentReasonOption[];
}
