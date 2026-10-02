import { supabaseAdmin } from "../config/supabase.js";
import { assertActiveDropdownOption } from "./dropdown-option.service.js";
import { assertEligibleAssignee } from "./lookup.service.js";
import { isValidUuid } from "../utils/validation.js";

const STORE_CALL_ALLOWED_FIELDS = [
  "trip_id",
  "trip_stop_id",
  "assigned_to",
  "contact_id",
  "status",
  "confirmation_status",
  "remarks",
  "date_assigned",
  "date_of_contact",
  "time_texted",
  "time_called",
  "contact_number",
  "contact_name",
] as const;

function normalizeOptionalUuid(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }

  return value;
}

function normalizeOptionalString(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalDateString(value: unknown, fieldName: string) {
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

function normalizeOptionalTimeText(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function getStoreCallById(id: string) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid store call id");
  }

  const { data, error } = await supabaseAdmin
    .from("store_calls")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Store call fetch failed:", { id, error });
    throw new Error("Unable to fetch store call");
  }

  if (!data) {
    throw new Error("Store call not found");
  }

  return data;
}

export async function updateStoreCallRecord(
  id: string,
  input: Record<string, unknown>,
) {
  if (!isValidUuid(id)) {
    throw new Error("Invalid store call id");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("store_calls")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    console.error("Store call existence check failed:", {
      id,
      error: existingError,
    });
    throw new Error("Unable to update store call");
  }

  if (!existing) {
    throw new Error("Store call not found");
  }

  const unknownFields = Object.keys(input).filter(
    (key) =>
      !STORE_CALL_ALLOWED_FIELDS.includes(
        key as (typeof STORE_CALL_ALLOWED_FIELDS)[number],
      ),
  );

  if (unknownFields.length > 0) {
    throw new Error(`Invalid store call field(s): ${unknownFields.join(", ")}`);
  }

  const payload: Record<string, unknown> = {};

  for (const field of STORE_CALL_ALLOWED_FIELDS) {
    if (!(field in input)) continue;
    const value = input[field];

    if (
      field === "trip_id" ||
      field === "trip_stop_id" ||
      field === "contact_id" ||
      field === "assigned_to"
    ) {
      const normalized = normalizeOptionalUuid(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    if (field === "date_assigned" || field === "date_of_contact") {
      const normalized = normalizeOptionalDateString(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    if (field === "time_texted" || field === "time_called") {
      const normalized = normalizeOptionalTimeText(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    if (
      field === "status" ||
      field === "confirmation_status" ||
      field === "remarks" ||
      field === "contact_number" ||
      field === "contact_name"
    ) {
      const normalized = normalizeOptionalString(value, field);
      if (normalized !== undefined) {
        payload[field] = normalized;
      } else if (value === null) {
        payload[field] = null;
      }
      continue;
    }

    payload[field] = value;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No valid store call fields were provided for update.");
  }

  if (payload.status !== undefined) {
    await assertActiveDropdownOption("store_call_status", payload.status);
  }
  if (payload.confirmation_status !== undefined) {
    await assertActiveDropdownOption(
      "confirmation_status",
      payload.confirmation_status,
    );
  }
  if (payload.assigned_to !== undefined) {
    await assertEligibleAssignee(String(payload.assigned_to));
  }

  const { data, error } = await supabaseAdmin
    .from("store_calls")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("Store call update failed:", { id, payload, error });
    throw new Error("Unable to update store call");
  }

  return data;
}
