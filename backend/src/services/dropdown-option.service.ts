import { supabaseAdmin } from "../config/supabase.js";

export const DROPDOWN_FIELDS = [
  "trip_status",
  "delivery_status",
  "letter_status",
  "store_call_status",
  "confirmation_status",
] as const;

export type DropdownField = (typeof DROPDOWN_FIELDS)[number];

const FIXED_LETTER_STATUSES = ["READY", "SENT", "CANCELLED"] as const;
const USAGE_TABLES: Record<DropdownField, { table: string; column: string }> = {
  trip_status: { table: "trips", column: "status" },
  delivery_status: { table: "trip_stops", column: "delivery_status" },
  letter_status: { table: "trips", column: "letter_status" },
  store_call_status: { table: "store_calls", column: "status" },
  confirmation_status: {
    table: "store_calls",
    column: "confirmation_status",
  },
};

function validateField(value: unknown): DropdownField {
  if (
    typeof value !== "string" ||
    !DROPDOWN_FIELDS.includes(value as DropdownField)
  ) {
    throw new Error("Invalid dropdown field key.");
  }
  return value as DropdownField;
}

function validateText(value: unknown, fieldName: string, maxLength = 80) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${fieldName} must be 1-${maxLength} characters.`);
  }
  return normalized;
}

function validateOptionValue(value: unknown) {
  const normalized = validateText(value, "option_value", 60).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 _-]*$/.test(normalized)) {
    throw new Error("option_value contains unsupported characters.");
  }
  return normalized;
}

async function getUsageCount(field: DropdownField, value: string) {
  const source = USAGE_TABLES[field];
  const { count, error } = await supabaseAdmin
    .from(source.table)
    .select("id", { count: "exact", head: true })
    .eq(source.column, value);
  if (error) {
    console.error("Dropdown option usage query failed:", { field, error });
    throw new Error("Unable to check where this dropdown option is used.");
  }
  return count ?? 0;
}

export async function listDropdownOptions(fieldInput?: unknown) {
  const field =
    fieldInput === undefined || fieldInput === ""
      ? undefined
      : validateField(fieldInput);
  let query = supabaseAdmin
    .from("tms_dropdown_options")
    .select(
      "id, field_key, option_value, display_label, sort_order, active, is_system",
    )
    .order("field_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("option_value", { ascending: true });
  if (field) query = query.eq("field_key", field);

  const { data, error } = await query;
  if (error) {
    console.error("Dropdown options query failed:", error);
    throw new Error(
      "Unable to load dropdown options. Apply the options migration first.",
    );
  }

  return Promise.all(
    (data ?? []).map(async (option) => ({
      ...option,
      usage_count: await getUsageCount(
        option.field_key as DropdownField,
        option.option_value,
      ),
    })),
  );
}

export async function createDropdownOption(input: Record<string, unknown>) {
  const field = validateField(input.field_key);
  if (field === "letter_status") {
    throw new Error(
      "Letter status values are fixed by the database constraint.",
    );
  }
  const optionValue = validateOptionValue(input.option_value);
  const displayLabel = validateText(input.display_label, "display_label");
  const sortOrder =
    input.sort_order === undefined ? 0 : Number(input.sort_order);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error("sort_order must be a non-negative integer.");
  }

  const { data, error } = await supabaseAdmin
    .from("tms_dropdown_options")
    .insert({
      field_key: field,
      option_value: optionValue,
      display_label: displayLabel,
      sort_order: sortOrder,
      active: true,
      is_system: false,
    })
    .select(
      "id, field_key, option_value, display_label, sort_order, active, is_system",
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "An option with this value already exists for this field.",
      );
    }
    console.error("Dropdown option create failed:", { field, error });
    throw new Error("Unable to add dropdown option.");
  }
  return { ...data, usage_count: 0 };
}

export async function updateDropdownOption(
  id: string,
  input: Record<string, unknown>,
) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Invalid dropdown option id.");
  }
  const allowedFields = ["display_label", "sort_order", "active"];
  const unknownFields = Object.keys(input).filter(
    (field) => !allowedFields.includes(field) && field !== "confirm_in_use",
  );
  if (unknownFields.length) {
    throw new Error(
      `Invalid dropdown option field(s): ${unknownFields.join(", ")}`,
    );
  }
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("tms_dropdown_options")
    .select(
      "id, field_key, option_value, display_label, sort_order, active, is_system",
    )
    .eq("id", id)
    .maybeSingle();
  if (lookupError || !existing) {
    throw new Error(
      lookupError
        ? "Unable to load dropdown option."
        : "Dropdown option not found.",
    );
  }

  const field = validateField(existing.field_key);
  const patch: Record<string, unknown> = {};
  if ("display_label" in input) {
    patch.display_label = validateText(input.display_label, "display_label");
  }
  if ("sort_order" in input) {
    const sortOrder = Number(input.sort_order);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error("sort_order must be a non-negative integer.");
    }
    patch.sort_order = sortOrder;
  }
  if ("active" in input) {
    if (typeof input.active !== "boolean") {
      throw new Error("active must be a boolean.");
    }
    if (field === "letter_status" && input.active === false) {
      throw new Error("Letter status options cannot be deactivated.");
    }
    patch.active = input.active;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("No dropdown option changes were provided.");
  }

  const usageCount = await getUsageCount(field, existing.option_value);
  const affectsInUseOption =
    usageCount > 0 &&
    (("display_label" in patch &&
      patch.display_label !== existing.display_label) ||
      patch.active === false);
  if (affectsInUseOption && input.confirm_in_use !== true) {
    const error = new Error(
      `This option is used by ${usageCount} record(s). Confirm to continue; stored values will not change, but labels or available choices will.`,
    ) as Error & { statusCode?: number; usageCount?: number };
    error.statusCode = 409;
    error.usageCount = usageCount;
    throw error;
  }

  const { data, error } = await supabaseAdmin
    .from("tms_dropdown_options")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(
      "id, field_key, option_value, display_label, sort_order, active, is_system",
    )
    .single();
  if (error) {
    console.error("Dropdown option update failed:", { id, error });
    throw new Error("Unable to update dropdown option.");
  }
  return { ...data, usage_count: usageCount };
}

export async function assertActiveDropdownOption(
  field: DropdownField,
  value: unknown,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be selected.`);
  }
  const normalized = value.trim();
  if (
    field === "letter_status" &&
    !FIXED_LETTER_STATUSES.includes(
      normalized as (typeof FIXED_LETTER_STATUSES)[number],
    )
  ) {
    throw new Error("letter_status must be READY, SENT, or CANCELLED.");
  }

  const { data, error } = await supabaseAdmin
    .from("tms_dropdown_options")
    .select("option_value")
    .eq("field_key", field)
    .eq("option_value", normalized)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`${field} must be an active configured option.`);
  }
}
