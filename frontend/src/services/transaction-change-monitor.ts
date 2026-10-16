import { apiGet, type ApiResponse } from "./api.service";

/** Authorized invalidation signal only: no private snapshot or image paths.
 * The caller owns the timer so there is one poller per authenticated session. */
export function createTransactionChangeMonitor(token: string, changed: () => void) {
  let active = true, busy = false, previous: string | null = null;
  return {
    async check() {
      if (!active || busy) return;
      busy = true;
      try {
        const response = await apiGet<ApiResponse<{ version: string | null }>>("/trips/transaction-changes", token);
        if (!active || !response.success || !response.data) return;
        const version = response.data.version;
        if (version !== previous) { previous = version; changed(); }
      } catch { /* Keep cached data. Next tick/focus retries without blanking it. */ }
      finally { busy = false; }
    },
    stop() { active = false; },
  };
}
