import { ApiError } from "./api.service.ts";

/** Only this preflight error guarantees that no rows were written. Never retry
 * generic 503s or follow-up failures, which may follow a successful commit. */
export async function withOptionalTripAddress<T>(save: (deferAddress: boolean) => Promise<T>, onDeferred: () => void): Promise<T> {
  try { return await save(false); }
  catch (error) {
    if (!(error instanceof ApiError) || error.code !== "TRIP_DELIVERY_LOCATION_SETUP_REQUIRED") throw error;
    onDeferred();
    return save(true);
  }
}

/** Keep identity/recovery decisions and plain text; never fall back to updating
 * the store master. The full reviewed point remains in the original draft. */
export function withoutTripMapPins<T extends Record<string, unknown>>(decisions: Record<string, T>) {
  return Object.fromEntries(Object.entries(decisions).map(([key, value]) => [key, {
    ...value, verified: false, latitude: "", longitude: "", update_store_location: false,
  }]));
}
