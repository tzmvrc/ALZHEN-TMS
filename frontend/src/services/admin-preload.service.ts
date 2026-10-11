import { fetchDropdownOptions } from "./dropdown-option.service";
import { searchRelationshipOptions } from "./lookup.service";
import { fetchReportPage, getSortableFields } from "./report.service";
import { fetchTripEvents, fetchTrips } from "./trip.service";
import { fetchTripImages } from "./trip-image.service";

/** Warm small, commonly reused authenticated resources without delaying navigation. */
export function preloadAdminPageData(token: string, role: string) {
  if (!token || !["ADMIN", "STAFF"].includes(role)) return;

  const page = (reportKey: "combined" | "dispatch-monitoring", limit = 50) =>
    fetchReportPage(reportKey, token, {
      page: 1,
      limit,
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
    // These are the first pages actually requested by the Reports and Trips
    // grids. Other report pages/filters remain on-demand to avoid broad pulls.
    page("combined"),
    page("dispatch-monitoring"),
    fetchReportPage("trip-booking", token, {
      page: 1,
      limit: 100,
      search: "",
      sortBy: "loading_date",
      sortOrder: "desc",
      filters: {},
    }),
    ...(["trip-types", "warehouses", "trucking-companies"] as const).map((kind) =>
      searchRelationshipOptions(token, kind, ""),
    ),
  ];

  // A preload failure is intentionally isolated from login and page navigation.
  void Promise.allSettled(tasks);
}
