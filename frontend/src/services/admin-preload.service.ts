import { fetchDropdownOptions } from "./dropdown-option.service";
import { searchRelationshipOptions } from "./lookup.service";
import { fetchReportPage, getSortableFields, type ReportKey } from "./report.service";
import { fetchTripEvents, fetchTrips } from "./trip.service";
import { fetchTripImages } from "./trip-image.service";

/** Warm small, commonly reused authenticated resources without delaying navigation. */
export function preloadAdminPageData(token: string, role: string) {
  if (!token || !["ADMIN", "STAFF"].includes(role)) return;

  const page = (reportKey: ReportKey) =>
    fetchReportPage(reportKey, token, {
      page: 1,
      limit: 50,
      search: "",
      sortBy: getSortableFields(reportKey)[0],
      sortOrder: "desc",
      filters: {},
    });
  const recentTrips = fetchTrips(token, { limit: 10 });
  const overviewTripDetails = recentTrips.then(async ({ rows }) => {
    const requests = rows.flatMap((trip) => typeof trip.id === "string" && trip.id
      ? [Promise.allSettled([
          fetchTripEvents(token, trip.id),
          fetchTripImages(token, trip.id),
        ])]
      : []);
    await Promise.allSettled(requests);
  });
  const tasks: Promise<unknown>[] = [
    fetchDropdownOptions(token),
    recentTrips,
    overviewTripDetails,
    fetchTrips(token, { limit: 1, status: "IN_PROGRESS" }),
    fetchTrips(token, { limit: 1, status: "COMPLETED" }),
    // Warm only the first page of each report. ReportDataView uses the same
    // token, page size, default sort, and filters so navigation consumes these
    // exact cached requests; later pages and filtered searches stay on-demand.
    page("combined"),
    page("dispatch-monitoring"),
    page("dispatch"),
    page("trip-booking"),
    page("store-calling"),
    ...(["trip-types", "warehouses", "trucking-companies"] as const).map((kind) =>
      searchRelationshipOptions(token, kind, ""),
    ),
  ];

  // A preload failure is intentionally isolated from login and page navigation.
  void Promise.allSettled(tasks);
}
