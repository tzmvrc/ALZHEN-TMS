import { supabaseAdmin } from "../config/supabase.js";

export type TruckerListItem = {
  id: string;
  driver_id: string;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  status: string | null;
  profile_picture_path: string | null;
  trucking_company_id: string | null;
  trucking_company_name: string | null;
  assigned_truck_id: string | null;
  plate_number: string | null;
  active_trip_id: string | null;
  active_trip_number: string | null;
  current_trip_status: string | null;
  delivery_status: string | null;
  loading_date: string | null;
};

export type TruckerDetail = {
  id: string;
  driver_id: string;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  status: string | null;
  profile_picture_path: string | null;
  trucking_company: {
    id: string | null;
    name: string | null;
    code: string | null;
  } | null;
  truck: {
    id: string | null;
    plate_number: string | null;
    truck_type: string | null;
    capacity_cbm: number | null;
    status: string | null;
  } | null;
  active_trip: {
    id: string | null;
    trip_number: string | null;
    dispatch_number: string | null;
    status: string | null;
    loading_date: string | null;
    estimated_delivery_date: string | null;
    route: string | null;
    delivery_status: string | null;
  } | null;
  trip_history: Array<{
    id: string;
    trip_number: string | null;
    dispatch_number: string | null;
    status: string | null;
    loading_date: string | null;
    estimated_delivery_date: string | null;
    origin: string | null;
    destination: string | null;
    customer: string | null;
    store: string | null;
    delivery_status: string | null;
    plate_number: string | null;
  }>;
};

function normalizeDriverStatus(value: string | null | undefined) {
  return value ? String(value).trim().toUpperCase() : "INACTIVE";
}

function formatFullName(firstName: string | null, lastName: string | null) {
  return (
    [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed trucker"
  );
}

function isActiveTripStatus(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  return ![
    "COMPLETED",
    "CANCELLED",
    "CANCELED",
    "CLOSED",
    "FINISHED",
    "ARCHIVED",
    "REJECTED",
  ].includes(normalized);
}

async function getProfileEmail(profileId: string): Promise<string | null> {
  try {
    const { data, error } =
      await supabaseAdmin.auth.admin.getUserById(profileId);
    if (error || !data?.user?.email) {
      return null;
    }
    return data.user.email;
  } catch {
    return null;
  }
}

async function getTruckMap(truckIds: string[]) {
  if (truckIds.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }

  const { data, error } = await supabaseAdmin
    .from("trucks")
    .select("id, plate_number, truck_type, capacity_cbm, status")
    .in("id", truckIds);

  if (error) {
    console.error("Truck lookup for truckers failed:", error);
    return new Map<string, Record<string, unknown>>();
  }

  const map = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    if (row?.id) {
      map.set(String(row.id), row as Record<string, unknown>);
    }
  }

  return map;
}

async function getTripDeliveryStatus(tripId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("trip_stops")
    .select("id, trip_id, stop_sequence, delivery_status")
    .eq("trip_id", tripId)
    .order("stop_sequence", { ascending: true });

  if (error || !data?.length) {
    return null;
  }

  const latestStop = [...data]
    .filter(
      (row) =>
        typeof row.delivery_status === "string" &&
        row.delivery_status.trim().length > 0,
    )
    .sort(
      (left, right) =>
        Number(right.stop_sequence ?? 0) - Number(left.stop_sequence ?? 0),
    )[0];

  return latestStop && typeof latestStop.delivery_status === "string"
    ? latestStop.delivery_status
    : null;
}

async function getTripStopRoute(
  tripId: string,
): Promise<{
  origin: string | null;
  destination: string | null;
  customer: string | null;
  store: string | null;
}> {
  const { data: stopRows, error } = await supabaseAdmin
    .from("trip_stops")
    .select("id, trip_id, stop_sequence, customer_id, store_id")
    .eq("trip_id", tripId)
    .order("stop_sequence", { ascending: true });

  if (error || !stopRows?.length) {
    return { origin: null, destination: null, customer: null, store: null };
  }

  const orderedStops = [...stopRows].sort(
    (left, right) =>
      Number(left.stop_sequence ?? 0) - Number(right.stop_sequence ?? 0),
  );
  const firstStop = orderedStops[0];
  const lastStop = orderedStops[orderedStops.length - 1];

  const storeIds = [
    ...new Set(
      orderedStops
        .map((stop) => stop.store_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];
  const customerIds = [
    ...new Set(
      orderedStops
        .map((stop) => stop.customer_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];

  const storeMap = new Map<string, string>();
  if (storeIds.length) {
    const { data: storeRows } = await supabaseAdmin
      .from("customer_stores")
      .select("id, name")
      .in("id", storeIds);
    for (const store of storeRows ?? []) {
      if (store?.id) {
        storeMap.set(
          String(store.id),
          typeof store.name === "string" ? store.name : "",
        );
      }
    }
  }

  const customerMap = new Map<string, string>();
  if (customerIds.length) {
    const { data: customerRows } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    for (const customer of customerRows ?? []) {
      if (customer?.id) {
        customerMap.set(
          String(customer.id),
          typeof customer.name === "string" ? customer.name : "",
        );
      }
    }
  }

  const origin = firstStop?.store_id
    ? (storeMap.get(String(firstStop.store_id)) ?? null)
    : null;
  const destination = lastStop?.store_id
    ? (storeMap.get(String(lastStop.store_id)) ?? null)
    : null;
  const customer = lastStop?.customer_id
    ? (customerMap.get(String(lastStop.customer_id)) ?? null)
    : null;
  const store = destination ?? origin ?? null;

  return { origin, destination, customer, store };
}

export async function getTruckerList(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 25);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 25;
  const from = (safePage - 1) * safeLimit;
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const status =
    typeof query.status === "string" ? query.status.trim().toUpperCase() : "";
  const assignmentFilter =
    typeof query.assignment === "string"
      ? query.assignment.toLowerCase()
      : "all";

  let driverQuery = supabaseAdmin
    .from("drivers")
    .select(
      "id, profile_id, first_name, last_name, contact_number, license_number, status, trucking_company_id, created_at, updated_at",
      { count: "exact" },
    );

  if (search) {
    driverQuery = driverQuery.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,contact_number.ilike.%${search}%`,
    );
  }

  if (status && status !== "ALL") {
    driverQuery = driverQuery.eq("status", status);
  }

  const {
    data: driverRows,
    error,
    count,
  } = await driverQuery
    .order("first_name", { ascending: true })
    .range(from, from + safeLimit - 1);

  if (error) {
    console.error("Trucker list query failed:", error);
    throw new Error("Unable to load truckers.");
  }

  const drivers = driverRows ?? [];
  const profileIds = drivers
    .map((row) => row.profile_id)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

  const profileMap = new Map<string, Record<string, unknown>>();
  if (profileIds.length) {
    const { data: profileRows } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, profile_picture_path")
      .in("id", profileIds);

    for (const profile of profileRows ?? []) {
      if (profile?.id) {
        profileMap.set(String(profile.id), profile as Record<string, unknown>);
      }
    }
  }

  const companyIds = drivers
    .map((row) => row.trucking_company_id)
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

  const companyMap = new Map<string, Record<string, unknown>>();
  if (companyIds.length) {
    const { data: companyRows } = await supabaseAdmin
      .from("trucking_companies")
      .select("id, name, code")
      .in("id", companyIds);

    for (const company of companyRows ?? []) {
      if (company?.id) {
        companyMap.set(String(company.id), company as Record<string, unknown>);
      }
    }
  }

  const driverIds = drivers.map((row) => String(row.id));
  const assignmentRows = driverIds.length
    ? await supabaseAdmin
        .from("trip_truck_assignments")
        .select("id, driver_id, trip_id, truck_id, assigned_at, unassigned_at")
        .in("driver_id", driverIds)
        .order("assigned_at", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  const tripIds = [
    ...new Set(
      (assignmentRows.data ?? [])
        .map((row) => row.trip_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];

  const tripMap = new Map<string, Record<string, unknown>>();
  if (tripIds.length) {
    const { data: tripRows } = await supabaseAdmin
      .from("trips")
      .select(
        "id, trip_number, dispatch_number, status, loading_date, estimated_delivery_date",
      )
      .in("id", tripIds);

    for (const trip of tripRows ?? []) {
      if (trip?.id) {
        tripMap.set(String(trip.id), trip as Record<string, unknown>);
      }
    }
  }

  const assignmentByDriver = new Map<string, Record<string, unknown> | null>();
  for (const driverId of driverIds) {
    const assignments = (assignmentRows.data ?? []).filter(
      (row) => String(row.driver_id) === driverId,
    );
    const activeAssignment = assignments.find((assignment) => {
      const tripId =
        typeof assignment.trip_id === "string" ? assignment.trip_id : null;
      if (!tripId) {
        return false;
      }
      const trip = tripMap.get(tripId);
      return trip ? isActiveTripStatus(trip.status) : false;
    });

    assignmentByDriver.set(driverId, activeAssignment ?? null);
  }

  const truckIds = [
    ...new Set(
      (assignmentRows.data ?? [])
        .map((row) => row.truck_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];
  const truckMap = await getTruckMap(truckIds);

  const items: TruckerListItem[] = [];
  for (const row of drivers) {
    const profileId = row.profile_id ? String(row.profile_id) : null;
    const profile = profileId ? (profileMap.get(profileId) ?? {}) : {};
    const companyId = row.trucking_company_id
      ? String(row.trucking_company_id)
      : null;
    const company = companyId ? (companyMap.get(companyId) ?? {}) : {};
    const assignment = assignmentByDriver.get(String(row.id)) ?? null;
    const tripId =
      assignment && typeof assignment.trip_id === "string"
        ? assignment.trip_id
        : null;
    const trip = tripId ? (tripMap.get(tripId) ?? null) : null;
    const truckId =
      assignment && typeof assignment.truck_id === "string"
        ? assignment.truck_id
        : null;
    const truck = truckId ? (truckMap.get(truckId) ?? null) : null;
    const fullName = formatFullName(
      typeof row.first_name === "string"
        ? row.first_name
        : ((profile.first_name as string | null) ?? null),
      typeof row.last_name === "string"
        ? row.last_name
        : ((profile.last_name as string | null) ?? null),
    );

    const item: TruckerListItem = {
      id: String(row.id),
      driver_id: String(row.id),
      profile_id: profileId,
      first_name:
        typeof row.first_name === "string"
          ? row.first_name
          : ((profile.first_name as string | null) ?? null),
      last_name:
        typeof row.last_name === "string"
          ? row.last_name
          : ((profile.last_name as string | null) ?? null),
      full_name: fullName,
      contact_number:
        typeof row.contact_number === "string" ? row.contact_number : null,
      email: profileId ? await getProfileEmail(profileId) : null,
      status: normalizeDriverStatus(
        typeof row.status === "string" ? row.status : null,
      ),
      profile_picture_path:
        typeof profile.profile_picture_path === "string"
          ? profile.profile_picture_path
          : null,
      trucking_company_id: companyId,
      trucking_company_name:
        typeof company.name === "string" ? company.name : null,
      assigned_truck_id: truckId,
      plate_number:
        truck && typeof truck.plate_number === "string"
          ? String(truck.plate_number)
          : null,
      active_trip_id: tripId,
      active_trip_number:
        trip && typeof trip.trip_number === "string"
          ? String(trip.trip_number)
          : null,
      current_trip_status:
        trip && typeof trip.status === "string" ? String(trip.status) : null,
      delivery_status: tripId ? await getTripDeliveryStatus(tripId) : null,
      loading_date:
        trip && typeof trip.loading_date === "string"
          ? String(trip.loading_date)
          : null,
    };

    if (assignmentFilter === "assigned" && !item.active_trip_id) continue;
    if (assignmentFilter === "unassigned" && item.active_trip_id) continue;

    items.push(item);
  }

  return {
    rows: items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count ?? items.length,
      totalPages: Math.max(1, Math.ceil((count ?? items.length) / safeLimit)),
    },
  };
}

export async function getTruckerById(id: string) {
  if (!id) {
    throw new Error("Trucker not found");
  }

  const { data: driver, error: driverError } = await supabaseAdmin
    .from("drivers")
    .select(
      "id, profile_id, first_name, last_name, contact_number, license_number, status, trucking_company_id, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (driverError) {
    console.error("Trucker detail fetch failed:", driverError);
    throw new Error("Unable to fetch trucker details.");
  }

  if (!driver) {
    throw new Error("Trucker not found");
  }

  const profileId = driver.profile_id ? String(driver.profile_id) : null;
  const { data: profile } = profileId
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, profile_picture_path, role")
        .eq("id", profileId)
        .maybeSingle()
    : { data: null };

  const { data: company } = driver.trucking_company_id
    ? await supabaseAdmin
        .from("trucking_companies")
        .select("id, name, code")
        .eq("id", String(driver.trucking_company_id))
        .maybeSingle()
    : { data: null };

  const { data: assignmentRows } = await supabaseAdmin
    .from("trip_truck_assignments")
    .select(
      "id, driver_id, trip_id, truck_id, trucking_company_id, assignment_type, assigned_at, unassigned_at, remarks, created_at, updated_at",
    )
    .eq("driver_id", String(driver.id))
    .order("assigned_at", { ascending: false });

  const sortedAssignments = [...(assignmentRows ?? [])].sort((left, right) => {
    const leftTime = left.assigned_at
      ? new Date(String(left.assigned_at)).getTime()
      : 0;
    const rightTime = right.assigned_at
      ? new Date(String(right.assigned_at)).getTime()
      : 0;
    return rightTime - leftTime;
  });

  const tripIds = [
    ...new Set(
      sortedAssignments
        .map((row) => row.trip_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];

  const tripMap = new Map<string, Record<string, unknown>>();
  if (tripIds.length) {
    const { data: tripRows, error: tripError } = await supabaseAdmin
      .from("trips")
      .select(
        "id, trip_number, dispatch_number, status, loading_date, estimated_delivery_date, authorization_letter, remarks, created_by, warehouse_id",
      )
      .in("id", tripIds);

    if (tripError) {
      console.error("Trucker trip detail fetch failed:", tripError);
    } else {
      for (const trip of tripRows ?? []) {
        if (trip?.id) {
          tripMap.set(String(trip.id), trip as Record<string, unknown>);
        }
      }
    }
  }

  const truckIds = [
    ...new Set(
      sortedAssignments
        .map((row) => row.truck_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];
  const truckMap = await getTruckMap(truckIds);

  const activeAssignment =
    sortedAssignments.find((assignment) => {
      const tripId =
        typeof assignment.trip_id === "string" ? assignment.trip_id : null;
      if (!tripId) {
        return false;
      }
      const trip = tripMap.get(tripId);
      return trip ? isActiveTripStatus(trip.status) : false;
    }) ?? null;

  const activeTrip =
    activeAssignment && typeof activeAssignment.trip_id === "string"
      ? (tripMap.get(String(activeAssignment.trip_id)) ?? null)
      : null;

  const activeTruck =
    activeAssignment && typeof activeAssignment.truck_id === "string"
      ? (truckMap.get(String(activeAssignment.truck_id)) ?? null)
      : null;

  const tripHistoryPayload = await Promise.all(
    sortedAssignments.map(async (assignment) => {
      const tripId =
        typeof assignment.trip_id === "string" ? assignment.trip_id : null;
      if (!tripId) {
        return null;
      }

      const trip = tripMap.get(tripId) ?? null;
      if (!trip) {
        return null;
      }

      const route = await getTripStopRoute(String(trip.id));
      const truck =
        typeof assignment.truck_id === "string"
          ? (truckMap.get(String(assignment.truck_id)) ?? null)
          : null;

      return {
        id: String(trip.id),
        trip_number:
          typeof trip.trip_number === "string" ? trip.trip_number : null,
        dispatch_number:
          typeof trip.dispatch_number === "string"
            ? trip.dispatch_number
            : null,
        status: typeof trip.status === "string" ? trip.status : null,
        loading_date:
          typeof trip.loading_date === "string" ? trip.loading_date : null,
        estimated_delivery_date:
          typeof trip.estimated_delivery_date === "string"
            ? trip.estimated_delivery_date
            : null,
        origin: route.origin,
        destination: route.destination,
        customer: route.customer,
        store: route.store,
        delivery_status: await getTripDeliveryStatus(String(trip.id)),
        plate_number:
          truck && typeof truck.plate_number === "string"
            ? String(truck.plate_number)
            : null,
      };
    }),
  );

  const activeTripRoute =
    activeTrip && typeof activeTrip.id === "string"
      ? await getTripStopRoute(String(activeTrip.id))
      : null;
  const activeTripDeliveryStatus =
    activeTrip && typeof activeTrip.id === "string"
      ? await getTripDeliveryStatus(String(activeTrip.id))
      : null;

  const truckerDetail: TruckerDetail = {
    id: String(driver.id),
    driver_id: String(driver.id),
    profile_id: profileId,
    first_name:
      typeof driver.first_name === "string"
        ? driver.first_name
        : ((profile?.first_name as string | null) ?? null),
    last_name:
      typeof driver.last_name === "string"
        ? driver.last_name
        : ((profile?.last_name as string | null) ?? null),
    full_name: formatFullName(
      typeof driver.first_name === "string"
        ? driver.first_name
        : ((profile?.first_name as string | null) ?? null),
      typeof driver.last_name === "string"
        ? driver.last_name
        : ((profile?.last_name as string | null) ?? null),
    ),
    contact_number:
      typeof driver.contact_number === "string" ? driver.contact_number : null,
    email: profileId ? await getProfileEmail(profileId) : null,
    status: normalizeDriverStatus(
      typeof driver.status === "string" ? driver.status : null,
    ),
    profile_picture_path:
      profile && typeof profile.profile_picture_path === "string"
        ? profile.profile_picture_path
        : null,
    trucking_company: company
      ? {
          id: typeof company.id === "string" ? company.id : null,
          name: typeof company.name === "string" ? company.name : null,
          code: typeof company.code === "string" ? company.code : null,
        }
      : null,
    truck: activeTruck
      ? {
          id:
            typeof activeTruck.id === "string" ? String(activeTruck.id) : null,
          plate_number:
            typeof activeTruck.plate_number === "string"
              ? String(activeTruck.plate_number)
              : null,
          truck_type:
            typeof activeTruck.truck_type === "string"
              ? String(activeTruck.truck_type)
              : null,
          capacity_cbm:
            typeof activeTruck.capacity_cbm === "number"
              ? Number(activeTruck.capacity_cbm)
              : null,
          status:
            typeof activeTruck.status === "string"
              ? String(activeTruck.status)
              : null,
        }
      : null,
    active_trip: activeTrip
      ? {
          id: typeof activeTrip.id === "string" ? String(activeTrip.id) : null,
          trip_number:
            typeof activeTrip.trip_number === "string"
              ? String(activeTrip.trip_number)
              : null,
          dispatch_number:
            typeof activeTrip.dispatch_number === "string"
              ? String(activeTrip.dispatch_number)
              : null,
          status:
            typeof activeTrip.status === "string"
              ? String(activeTrip.status)
              : null,
          loading_date:
            typeof activeTrip.loading_date === "string"
              ? String(activeTrip.loading_date)
              : null,
          estimated_delivery_date:
            typeof activeTrip.estimated_delivery_date === "string"
              ? String(activeTrip.estimated_delivery_date)
              : null,
          route:
            activeTripRoute &&
            (activeTripRoute.origin || activeTripRoute.destination)
              ? [activeTripRoute.origin, activeTripRoute.destination]
                  .filter(Boolean)
                  .join(" → ") || null
              : null,
          delivery_status: activeTripDeliveryStatus,
        }
      : null,
    trip_history: tripHistoryPayload.filter(
      (row): row is NonNullable<typeof row> => Boolean(row),
    ),
  };

  return truckerDetail;
}
