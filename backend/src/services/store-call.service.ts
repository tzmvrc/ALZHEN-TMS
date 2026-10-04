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
    .select("id, trip_id, trip_stop_id, assigned_to")
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
  if (payload.contact_id) {
    const stopId =
      typeof payload.trip_stop_id === "string"
        ? payload.trip_stop_id
        : existing.trip_stop_id;
    if (typeof stopId !== "string") {
      throw new Error("Invalid relationship: contact requires a linked stop.");
    }

    const { data: stop, error: stopError } = await supabaseAdmin
      .from("trip_stops")
      .select("id, trip_id, store_id")
      .eq("id", stopId)
      .maybeSingle();
    if (stopError) {
      throw new Error("Unable to validate the store-call stop relationship.");
    }
    if (!stop) {
      throw new Error("Invalid relationship: linked stop was not found.");
    }
    const tripId =
      typeof payload.trip_id === "string" ? payload.trip_id : existing.trip_id;
    if (typeof tripId === "string" && stop.trip_id !== tripId) {
      throw new Error("Invalid relationship: stop does not belong to trip.");
    }
    if (typeof stop.store_id !== "string") {
      throw new Error("Invalid relationship: linked stop has no store.");
    }

    const { data: contact, error: contactError } = await supabaseAdmin
      .from("store_contacts")
      .select("id, store_id")
      .eq("id", payload.contact_id)
      .maybeSingle();
    if (contactError) {
      throw new Error("Unable to validate the selected store contact.");
    }
    if (!contact || contact.store_id !== stop.store_id) {
      throw new Error(
        "Invalid relationship: contact does not belong to the linked store.",
      );
    }
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

  return { record: data, previousAssignedTo: existing.assigned_to as string | null };
}
