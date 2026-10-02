import { supabaseAdmin } from "../config/supabase.js";
import type {
  AssignmentCompanySummary,
  AssignmentDriverSummary,
  AssignmentTruckSummary,
  TripAssignmentRecord,
  TripAssignmentWithRelations,
} from "../types/assignment.types.js";
import { isValidUuid } from "../utils/validation.js";

const ASSIGNMENT_ALLOWED_FIELDS = [
  "truck_id",
  "driver_id",
  "trucking_company_id",
  "assignment_type",
  "assigned_at",
  "unassigned_at",
  "remarks",
] as const;

function normalizeAssignmentType(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("assignment_type must be a string.");
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.toUpperCase();
}

function normalizeTextValue(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeUuidValue(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }

  return value;
}

function normalizeDateValue(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a valid date string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date string.`);
  }

  return trimmed;
}

async function assertTripExists(tripId: string) {
  const { data, error } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Trip assignment route trip lookup failed:", error);
    throw new Error("Unable to load trip");
  }

  if (!data) {
    throw new Error("Trip not found");
  }
}

function validateAssignmentType(value: unknown) {
  return normalizeAssignmentType(value);
}

async function getDriverMap(driverIds: string[]) {
  const uniqueIds = [...new Set(driverIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map<string, AssignmentDriverSummary>();
  }

  const { data, error } = await supabaseAdmin
    .from("drivers")
    .select(
      "id, first_name, last_name, contact_number, status, profile_id, trucking_company_id",
    )
    .in("id", uniqueIds);

  if (error) {
    console.error("Driver relationship lookup failed:", error);
    return new Map<string, AssignmentDriverSummary>();
  }

  const map = new Map<string, AssignmentDriverSummary>();
  for (const row of data ?? []) {
    if (!row?.id) continue;
    map.set(String(row.id), {
      id: typeof row.id === "string" ? row.id : null,
      first_name: typeof row.first_name === "string" ? row.first_name : null,
      last_name: typeof row.last_name === "string" ? row.last_name : null,
      contact_number:
        typeof row.contact_number === "string" ? row.contact_number : null,
      status: typeof row.status === "string" ? row.status : null,
      profile_id: typeof row.profile_id === "string" ? row.profile_id : null,
      trucking_company_id:
        typeof row.trucking_company_id === "string"
          ? row.trucking_company_id
          : null,
    });
  }

  return map;
}

async function getTruckMap(truckIds: string[]) {
  const uniqueIds = [...new Set(truckIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map<string, AssignmentTruckSummary>();
  }

  const { data, error } = await supabaseAdmin
    .from("trucks")
    .select(
      "id, plate_number, truck_type, capacity_cbm, status, trucking_company_id",
    )
    .in("id", uniqueIds);

  if (error) {
    console.error("Truck relationship lookup failed:", error);
    return new Map<string, AssignmentTruckSummary>();
  }

  const map = new Map<string, AssignmentTruckSummary>();
  for (const row of data ?? []) {
    if (!row?.id) continue;
    map.set(String(row.id), {
      id: typeof row.id === "string" ? row.id : null,
      plate_number:
        typeof row.plate_number === "string" ? row.plate_number : null,
      truck_type: typeof row.truck_type === "string" ? row.truck_type : null,
      capacity_cbm:
        typeof row.capacity_cbm === "number" ? row.capacity_cbm : null,
      status: typeof row.status === "string" ? row.status : null,
      trucking_company_id:
        typeof row.trucking_company_id === "string"
          ? row.trucking_company_id
          : null,
    });
  }

  return map;
}

async function getCompanyMap(companyIds: string[]) {
  const uniqueIds = [...new Set(companyIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map<string, AssignmentCompanySummary>();
  }

  const { data, error } = await supabaseAdmin
    .from("trucking_companies")
    .select("id, name, code, status")
    .in("id", uniqueIds);

  if (error) {
    console.error("Trucking company relationship lookup failed:", error);
    return new Map<string, AssignmentCompanySummary>();
  }

  const map = new Map<string, AssignmentCompanySummary>();
  for (const row of data ?? []) {
    if (!row?.id) continue;
    map.set(String(row.id), {
      id: typeof row.id === "string" ? row.id : null,
      name: typeof row.name === "string" ? row.name : null,
      code: typeof row.code === "string" ? row.code : null,
      status: typeof row.status === "string" ? row.status : null,
    });
  }

  return map;
}

function sortAssignments(rows: TripAssignmentRecord[]) {
  return [...rows].sort((left, right) => {
    const leftTime = left.assigned_at
      ? new Date(left.assigned_at).getTime()
      : 0;
    const rightTime = right.assigned_at
      ? new Date(right.assigned_at).getTime()
      : 0;
    return rightTime - leftTime;
  });
}

async function buildAssignmentRelations(
  rows: TripAssignmentRecord[],
): Promise<TripAssignmentWithRelations[]> {
  const driverIds = rows
    .map((row) => row.driver_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const truckIds = rows
    .map((row) => row.truck_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const companyIds = rows
    .map((row) => row.trucking_company_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const [driverMap, truckMap, companyMap] = await Promise.all([
    getDriverMap(driverIds),
    getTruckMap(truckIds),
    getCompanyMap(companyIds),
  ]);

  return rows.map((row) => ({
    ...row,
    driver: row.driver_id ? (driverMap.get(row.driver_id) ?? null) : null,
    truck: row.truck_id ? (truckMap.get(row.truck_id) ?? null) : null,
    trucking_company: row.trucking_company_id
      ? (companyMap.get(row.trucking_company_id) ?? null)
      : null,
  }));
}

export async function getTripAssignments(tripId: string) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  await assertTripExists(tripId);

  const { data, error } = await supabaseAdmin
    .from("trip_truck_assignments")
    .select(
      "id, trip_id, truck_id, driver_id, trucking_company_id, assignment_type, assigned_at, unassigned_at, remarks, created_at, updated_at",
    )
    .eq("trip_id", tripId)
    .order("assigned_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("Trip assignment list query failed:", error);
    throw new Error("Unable to fetch trip assignments");
  }

  const rows = (data ?? []) as TripAssignmentRecord[];
  const sortedRows = sortAssignments(rows);
  return buildAssignmentRelations(sortedRows);
}

export async function createTripAssignment(
  tripId: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  await assertTripExists(tripId);

  const payload: Record<string, unknown> = { trip_id: tripId };
  const unknownFields = Object.keys(input).filter(
    (key) =>
      !ASSIGNMENT_ALLOWED_FIELDS.includes(
        key as (typeof ASSIGNMENT_ALLOWED_FIELDS)[number],
      ),
  );

  if (unknownFields.length > 0) {
    throw new Error(`Invalid assignment field(s): ${unknownFields.join(", ")}`);
  }

  for (const field of ASSIGNMENT_ALLOWED_FIELDS) {
    if (!(field in input)) continue;
    const value = input[field];

    if (
      field === "driver_id" ||
      field === "truck_id" ||
      field === "trucking_company_id"
    ) {
      const normalized = normalizeUuidValue(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
    } else if (field === "assignment_type") {
      const normalized = validateAssignmentType(value);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
    } else if (field === "assigned_at" || field === "unassigned_at") {
      const normalized = normalizeDateValue(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
    } else if (field === "remarks") {
      const normalized = normalizeTextValue(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
    }
  }

  if (payload.driver_id !== undefined && payload.driver_id !== null) {
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("id", String(payload.driver_id))
      .maybeSingle();

    if (error) {
      console.error("Driver validation failed:", error);
      throw new Error("Unable to validate driver");
    }

    if (!data) {
      throw new Error("Driver not found");
    }
  }

  if (payload.truck_id !== undefined && payload.truck_id !== null) {
    const { data, error } = await supabaseAdmin
      .from("trucks")
      .select("id")
      .eq("id", String(payload.truck_id))
      .maybeSingle();

    if (error) {
      console.error("Truck validation failed:", error);
      throw new Error("Unable to validate truck");
    }

    if (!data) {
      throw new Error("Truck not found");
    }
  }

  if (
    payload.trucking_company_id !== undefined &&
    payload.trucking_company_id !== null
  ) {
    const { data, error } = await supabaseAdmin
      .from("trucking_companies")
      .select("id")
      .eq("id", String(payload.trucking_company_id))
      .maybeSingle();

    if (error) {
      console.error("Trucking company validation failed:", error);
      throw new Error("Unable to validate trucking company");
    }

    if (!data) {
      throw new Error("Trucking company not found");
    }
  }

  const { data, error } = await supabaseAdmin
    .from("trip_truck_assignments")
    .insert(payload)
    .select(
      "id, trip_id, truck_id, driver_id, trucking_company_id, assignment_type, assigned_at, unassigned_at, remarks, created_at, updated_at",
    )
    .single();

  if (error) {
    console.error("Trip assignment creation failed:", error);
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Assignment already exists.");
    }
    if (
      error.code === "23503" ||
      /foreign key|violates/.test(String(error.message))
    ) {
      throw new Error("Assignment relationship is invalid.");
    }
    throw new Error("Unable to create assignment");
  }

  return data as TripAssignmentRecord;
}

export async function updateTripAssignment(
  tripId: string,
  assignmentId: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  if (!isValidUuid(assignmentId)) {
    throw new Error("Invalid assignment id");
  }

  await assertTripExists(tripId);

  const existing = await supabaseAdmin
    .from("trip_truck_assignments")
    .select("id, trip_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (existing.error) {
    console.error("Assignment lookup failed:", existing.error);
    throw new Error("Unable to fetch assignment");
  }

  if (!existing.data) {
    throw new Error("Assignment not found");
  }

  if (existing.data.trip_id !== tripId) {
    throw new Error("Assignment does not belong to this trip");
  }

  const unknownFields = Object.keys(input).filter(
    (key) =>
      !ASSIGNMENT_ALLOWED_FIELDS.includes(
        key as (typeof ASSIGNMENT_ALLOWED_FIELDS)[number],
      ),
  );

  if (unknownFields.length > 0) {
    throw new Error(`Invalid assignment field(s): ${unknownFields.join(", ")}`);
  }

  if (Object.keys(input).length === 0) {
    throw new Error("No valid assignment fields were provided for update.");
  }

  const payload: Record<string, unknown> = {};
  for (const field of ASSIGNMENT_ALLOWED_FIELDS) {
    if (!(field in input)) continue;
    const value = input[field];

    if (
      field === "driver_id" ||
      field === "truck_id" ||
      field === "trucking_company_id"
    ) {
      if (value === null) {
        payload[field] = null;
      } else {
        payload[field] = normalizeUuidValue(value, field);
      }
    } else if (field === "assignment_type") {
      const normalized = validateAssignmentType(value);
      if (normalized === undefined && value === null) {
        payload[field] = null;
      } else if (normalized !== undefined) {
        payload[field] = normalized;
      }
    } else if (field === "assigned_at" || field === "unassigned_at") {
      if (value === null) {
        payload[field] = null;
      } else {
        payload[field] = normalizeDateValue(value, field);
      }
    } else if (field === "remarks") {
      if (value === null) {
        payload[field] = null;
      } else {
        const normalized = normalizeTextValue(value, field);
        if (normalized !== undefined) {
          payload[field] = normalized;
        }
      }
    }
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No valid assignment fields were provided for update.");
  }

  if (payload.driver_id !== undefined && payload.driver_id !== null) {
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("id", String(payload.driver_id))
      .maybeSingle();

    if (error) {
      console.error("Driver validation failed:", error);
      throw new Error("Unable to validate driver");
    }

    if (!data) {
      throw new Error("Driver not found");
    }
  }

  if (payload.truck_id !== undefined && payload.truck_id !== null) {
    const { data, error } = await supabaseAdmin
      .from("trucks")
      .select("id")
      .eq("id", String(payload.truck_id))
      .maybeSingle();

    if (error) {
      console.error("Truck validation failed:", error);
      throw new Error("Unable to validate truck");
    }

    if (!data) {
      throw new Error("Truck not found");
    }
  }

  if (
    payload.trucking_company_id !== undefined &&
    payload.trucking_company_id !== null
  ) {
    const { data, error } = await supabaseAdmin
      .from("trucking_companies")
      .select("id")
      .eq("id", String(payload.trucking_company_id))
      .maybeSingle();

    if (error) {
      console.error("Trucking company validation failed:", error);
      throw new Error("Unable to validate trucking company");
    }

    if (!data) {
      throw new Error("Trucking company not found");
    }
  }

  const { data, error } = await supabaseAdmin
    .from("trip_truck_assignments")
    .update(payload)
    .eq("id", assignmentId)
    .eq("trip_id", tripId)
    .select(
      "id, trip_id, truck_id, driver_id, trucking_company_id, assignment_type, assigned_at, unassigned_at, remarks, created_at, updated_at",
    )
    .single();

  if (error) {
    console.error("Trip assignment update failed:", error);
    if (
      error.code === "23505" ||
      /duplicate key|duplicate/.test(String(error.message))
    ) {
      throw new Error("Assignment already exists.");
    }
    if (
      error.code === "23503" ||
      /foreign key|violates/.test(String(error.message))
    ) {
      throw new Error("Assignment relationship is invalid.");
    }
    throw new Error("Unable to update assignment");
  }

  return data as TripAssignmentRecord;
}

export async function deleteTripAssignment(
  tripId: string,
  assignmentId: string,
) {
  if (!isValidUuid(tripId)) {
    throw new Error("Invalid trip id");
  }

  if (!isValidUuid(assignmentId)) {
    throw new Error("Invalid assignment id");
  }

  await assertTripExists(tripId);

  const { data, error } = await supabaseAdmin
    .from("trip_truck_assignments")
    .select("id, trip_id")
    .eq("id", assignmentId)
    .eq("trip_id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Assignment ownership check failed:", error);
    throw new Error("Unable to delete assignment");
  }

  if (!data) {
    throw new Error("Assignment not found for this trip");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("trip_truck_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("trip_id", tripId);

  if (deleteError) {
    console.error("Assignment deletion failed:", deleteError);
    if (
      deleteError.code === "23503" ||
      /foreign key|violates/.test(String(deleteError.message))
    ) {
      throw new Error(
        "Assignment deletion is blocked by existing dependent records.",
      );
    }
    throw new Error("Unable to delete assignment");
  }

  return { id: assignmentId };
}

export async function getAssignmentByIdForTrip(
  tripId: string,
  assignmentId: string,
) {
  if (!isValidUuid(tripId) || !isValidUuid(assignmentId)) {
    throw new Error("Invalid trip or assignment id");
  }

  await assertTripExists(tripId);

  const { data, error } = await supabaseAdmin
    .from("trip_truck_assignments")
    .select(
      "id, trip_id, truck_id, driver_id, trucking_company_id, assignment_type, assigned_at, unassigned_at, remarks, created_at, updated_at",
    )
    .eq("id", assignmentId)
    .eq("trip_id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Assignment fetch failed:", error);
    throw new Error("Unable to fetch assignment");
  }

  if (!data) {
    throw new Error("Assignment not found");
  }

  const [record] = await buildAssignmentRelations([
    data as TripAssignmentRecord,
  ]);
  return record;
}
