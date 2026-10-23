import type { TripDetails } from "../../../packages/trip-import/trip-details.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";

/** Validate without rewriting the immutable target snapshot used by retries. */
export function validateImportTripDetails(input: unknown, forDraft = false): asserts input is TripDetails {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("Trip details must be an object.", 400, "INVALID_IMPORT_TRIP_DETAILS");
  const details = input as Record<string, unknown>;
  for (const field of ["trip_type_id", "trip_type_name", "status", "loading_date", "estimated_delivery_date", "remarks", "origin_warehouse_id"]) if (!Object.hasOwn(details, field)) throw new ApiError(`Trip details must include ${field}; use null for an empty optional value.`, 400);
  for (const field of ["trip_type_id", "origin_warehouse_id"]) {
    const value = details[field];
    if (value != null && (typeof value !== "string" || !isValidUuid(value))) throw new ApiError(`Choose a valid ${field} for this trip group.`, 400);
  }
  for (const [field, limit] of [["trip_type_name", 100], ["status", 80], ["remarks", 10000]] as const) {
    const value = details[field];
    if (value != null && (typeof value !== "string" || value.length > limit)) throw new ApiError(`Use text of ${limit} characters or fewer for ${field}.`, 400);
  }
  if (typeof details.status !== "string" || !details.status.trim()) throw new ApiError("Choose a trip status.", 400);
  for (const field of ["loading_date", "estimated_delivery_date"] as const) {
    const value = details[field];
    if (value == null) continue;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(`${field} must be a YYYY-MM-DD date or empty.`, 400);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ApiError(`${field} must be a valid calendar date.`, 400);
  }
  // Drafts must retain an in-progress date edit so it can be corrected/reopened.
  if (!forDraft && typeof details.loading_date === "string" && typeof details.estimated_delivery_date === "string" && details.estimated_delivery_date < details.loading_date) throw new ApiError("Estimated delivery cannot be before loading date.", 400);
}
