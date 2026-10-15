import { fetchDropdownOptions } from "./dropdown-option.service";
import { searchRelationshipOptions } from "./lookup.service";
import { REPORTS, fetchReportPage, getInitialReportPageOptions, type ReportKey } from "./report.service";
import { fetchTrips } from "./trip.service";
import { runBackgroundPreload } from "./background-preload";

let preloadGeneration = 0;
let preloadToken: string | null = null;

export function cancelAdminPreload() {
  preloadGeneration += 1;
  preloadToken = null;
}

/** Schedule shared references and bounded report pages without holding login
 * open. Lazy tasks limit concurrency; failed resources retry on navigation. */
export async function preloadAdminPageData(token: string, role: string): Promise<void> {
  if (!token || !["ADMIN", "STAFF"].includes(role)) { cancelAdminPreload(); return; }
  if (preloadToken === token) return;
  preloadToken = token;
  const generation = ++preloadGeneration;
  const shared = [
    () => fetchDropdownOptions(token),
    ...(["trip-types", "warehouses", "trucking-companies"] as const).map((kind) =>
      () => searchRelationshipOptions(token, kind, ""),
    ),
  ];

  const page = (reportKey: ReportKey) =>
    fetchReportPage(reportKey, token, getInitialReportPageOptions(reportKey));
  const tasks: Array<() => Promise<unknown>> = [
    ...shared,
    () => page("combined"),
    () => fetchReportPage("dispatch-monitoring", token, {
      ...getInitialReportPageOptions("dispatch-monitoring"), filters: { active_transactions: "true", archive_scope: "active" },
    }),
    () => fetchTrips(token, { limit: 10 }),
    () => fetchTrips(token, { limit: 1, status: "IN_PROGRESS" }),
    () => fetchTrips(token, { limit: 1, status: "COMPLETED" }),
    // Warm only the first page of each report. ReportDataView uses the same
    // token, page size, default sort, and filters so navigation consumes these
    // exact cached requests; later pages and filtered searches stay on-demand.
    ...(Object.keys(REPORTS) as ReportKey[]).filter((key) => key !== "combined").map((key) => () => page(key)),
  ];

  // A preload failure is intentionally isolated from login and page navigation.
  void runBackgroundPreload(tasks, 2, () => generation === preloadGeneration && preloadToken === token);
}
