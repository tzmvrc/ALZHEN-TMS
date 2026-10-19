import {ApiError} from "./api.service";

/** Compact UI feedback only. Never decides whether deletion is authorized. */
export function wholeTripBlockerMessage(reasons: readonly string[]): string {
  const reason = reasons.join(" ");
  if (/disabled|activation|unavailable|migration/i.test(reason)) return "Trip deletion is currently unavailable.";
  if (/upload.*(incomplete|pending)|pending.*upload/i.test(reason)) return "A receipt upload is incomplete. Please finish or recover it first.";
  if (/billing|payable|receivable|financial|accounting/i.test(reason)) return "This trip has financial records that must be retained.";
  if (/journal|constraint|inconsistent/i.test(reason)) return "A data consistency check prevented deletion. Please contact an administrator.";
  if (/ownership|unregistered|shared|legacy|retained driver/i.test(reason)) return "Attachment ownership needs review before this trip can be deleted.";
  if (/object.*(missing|changed)|missing.*object|storage.*identity/i.test(reason)) return "A receipt is missing or has changed. Please contact an administrator.";
  if (/retention|protected|history|document|drive/i.test(reason)) return "This trip cannot be deleted because some records are protected.";
  return "Unable to delete the selected trips. Please try again.";
}

export function wholeTripDeletionErrorMessage(error: unknown): string {
  if ((error instanceof TypeError && /fetch|network|load failed|connection/i.test(error.message)) || (error instanceof ApiError && [0,408].includes(error.status))) return "Unable to complete deletion. Please check your connection and try again.";
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 429) return "Too many attempts. Please try again later.";
    if (error.status === 403) return /password/i.test(error.message) ? "Incorrect password. Please try again." : "You are not authorized to delete these trips.";
    if (error.status === 409) {
      if (/deadlock|lock timeout|concurrent|no longer|not found|does not exist|identity does not match/i.test(error.message)) return "The selected trips have changed. Please close and try again.";
      return wholeTripBlockerMessage([error.message]);
    }
  }
  return "Something went wrong while deleting the trip. Please try again.";
}
