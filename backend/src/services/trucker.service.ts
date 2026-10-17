import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../config/supabase.js";
import { buildIlikeOrFilter } from "../utils/postgrest-search.js";
import { deleteTripImage, uploadTripImage } from "./trip-image.service.js";
import { storeDriverReceiptText } from "./trip-receipt.service.js";

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
  activeOnly = false,
): Promise<{
  origin: string | null;
  origin_latitude: number | null;
  origin_longitude: number | null;
  destination: string | null;
  customer: string | null;
  store: string | null;
}> {
  const [{ data: trip, error: tripError }, { data: stopRows, error: stopError }] = await Promise.all([
    supabaseAdmin.from("trips").select("warehouse_id").eq("id", tripId).maybeSingle(),
    supabaseAdmin
    .from("trip_stops")
    .select("id, trip_id, stop_sequence, customer_id, store_id, archived_at")
    .eq("trip_id", tripId)
    .order("stop_sequence", { ascending: true }),
  ]);

  if (tripError || stopError) {
    console.error("Assigned trip route lookup failed:", { tripId, tripError, stopError });
    throw new Error("Unable to load assigned trip route.");
  }
  if (!stopRows?.length) {
    return {
      origin: null,
      origin_latitude: null,
      origin_longitude: null,
      destination: null,
      customer: null,
      store: null,
    };
  }

  const orderedStops = stopRows.filter((stop) => !activeOnly || !stop.archived_at).sort(
    (left, right) =>
      Number(left.stop_sequence ?? 0) - Number(right.stop_sequence ?? 0),
  );
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
    const { data: storeRows, error: storeError } = await supabaseAdmin
      .from("customer_stores")
      .select("id, name")
      .in("id", storeIds);
    if (storeError) {
      console.error("Assigned trip stores lookup failed:", { tripId, storeError });
      throw new Error("Unable to load assigned trip stores.");
    }
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
    const { data: customerRows, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    if (customerError) {
      console.error("Assigned trip customers lookup failed:", { tripId, customerError });
      throw new Error("Unable to load assigned trip customers.");
    }
    for (const customer of customerRows ?? []) {
      if (customer?.id) {
        customerMap.set(
          String(customer.id),
          typeof customer.name === "string" ? customer.name : "",
        );
      }
    }
  }

  const warehouseId = typeof trip?.warehouse_id === "string" ? trip.warehouse_id : null;
  let origin: string | null = null;
  let originLatitude: number | null = null;
  let originLongitude: number | null = null;
  if (warehouseId) {
    const { data: warehouse, error: warehouseError } = await supabaseAdmin
      .from("warehouses")
      .select("name, latitude, longitude")
      .eq("id", warehouseId)
      .maybeSingle();
    if (warehouseError) {
      console.error("Assigned trip warehouse lookup failed:", { tripId, warehouseError });
      throw new Error("Unable to load assigned trip warehouse.");
    }
    origin = typeof warehouse?.name === "string" ? warehouse.name : null;
    const latitude = Number(warehouse?.latitude);
    const longitude = Number(warehouse?.longitude);
    if (
      Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ) {
      originLatitude = latitude;
      originLongitude = longitude;
    }
  }
  const destinations = [...new Set(orderedStops
    .map((stop) => typeof stop.store_id === "string" ? storeMap.get(stop.store_id) : null)
    .filter((name): name is string => Boolean(name)))];
  const destination = destinations.length ? destinations.join(" → ") : null;
  const customer = lastStop?.customer_id
    ? (customerMap.get(String(lastStop.customer_id)) ?? null)
    : null;
  const store = destinations[destinations.length - 1] ?? null;

  return {
    origin,
    origin_latitude: originLatitude,
    origin_longitude: originLongitude,
    destination,
    customer,
    store,
  };
}

async function getDriverTripStops(tripIds: string[]) {
  const { data: stops, error: stopsError } = await supabaseAdmin
    .from("trip_stops")
    .select("id, trip_id, stop_sequence, store_id, customer_id, delivery_status, arrival_time, start_unloading_time, finish_unloading_time, remarks, dr_number, dispatch_number, archived_at")
    .in("trip_id", tripIds)
    .order("stop_sequence", { ascending: true });
  if (stopsError) {
    console.error("Driver trip stops lookup failed:", stopsError);
    throw new Error("Unable to load the delivery stops for your trips.");
  }
  if (!stops?.length) return new Map<string, DriverAssignedTrip["stops"]>();

  const stopIds = stops.map((stop) => String(stop.id));
  const storeIds = [...new Set(stops.map((stop) => stop.store_id).filter((id): id is string => typeof id === "string"))];
  const customerIds = [...new Set(stops.map((stop) => stop.customer_id).filter((id): id is string => typeof id === "string"))];
  const [{ data: lineItems, error: lineItemsError }, { data: stores, error: storesError }, { data: customers, error: customersError }] = await Promise.all([
    supabaseAdmin
      .from("trip_line_items")
      .select("id, trip_id, trip_stop_id, product_id, dr_number, quantity, cbm")
      .in("trip_stop_id", stopIds),
    storeIds.length
      ? supabaseAdmin.from("customer_stores").select("id, name, address, city, province").in("id", storeIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabaseAdmin.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lineItemsError || storesError || customersError) {
    console.error("Driver trip stop details lookup failed:", { lineItemsError, storesError, customersError });
    throw new Error("Unable to load store and product details for your trips.");
  }

  const productIds = [...new Set((lineItems ?? []).map((item) => item.product_id).filter((id): id is string => typeof id === "string"))];
  const { data: products, error: productsError } = productIds.length
    ? await supabaseAdmin.from("products").select("id, name, sku, model_code").in("id", productIds)
    : { data: [], error: null };
  if (productsError) {
    console.error("Driver trip products lookup failed:", productsError);
    throw new Error("Unable to load product details for your trips.");
  }

  const storesById = new Map((stores ?? []).map((row) => [String(row.id), row]));
  const customersById = new Map((customers ?? []).map((row) => [String(row.id), row]));
  const productsById = new Map((products ?? []).map((row) => [String(row.id), row]));
  const lineItemsByStop = new Map<string, typeof lineItems>();
  for (const item of lineItems ?? []) {
    const list = lineItemsByStop.get(String(item.trip_stop_id)) ?? [];
    list.push(item);
    lineItemsByStop.set(String(item.trip_stop_id), list);
  }

  return new Map<string, DriverAssignedTrip["stops"]>(tripIds.map((tripId) => [
    tripId,
    stops.filter((stop) => String(stop.trip_id) === tripId && !stop.archived_at).map((stop) => {
      const store = stop.store_id ? storesById.get(String(stop.store_id)) : null;
      const customer = stop.customer_id ? customersById.get(String(stop.customer_id)) : null;
      return {
        id: String(stop.id),
        dispatch_number: typeof stop.dispatch_number === "string" ? stop.dispatch_number : null,
        dr_number: typeof stop.dr_number === "string" ? stop.dr_number : null,
        notes: typeof stop.remarks === "string" ? stop.remarks : null,
        stop_sequence: Number(stop.stop_sequence ?? 0),
        store_name: typeof store?.name === "string" ? store.name : null,
        customer_name: typeof customer?.name === "string" ? customer.name : null,
        address: typeof store?.address === "string" ? store.address : null,
        city: typeof store?.city === "string" ? store.city : null,
        province: typeof store?.province === "string" ? store.province : null,
        delivery_status: typeof stop.delivery_status === "string" ? stop.delivery_status : null,
        arrival_time: typeof stop.arrival_time === "string" ? stop.arrival_time : null,
        start_unloading_time: typeof stop.start_unloading_time === "string" ? stop.start_unloading_time : null,
        finish_unloading_time: typeof stop.finish_unloading_time === "string" ? stop.finish_unloading_time : null,
        items: (lineItemsByStop.get(String(stop.id)) ?? []).map((item) => {
          const product = item.product_id ? productsById.get(String(item.product_id)) : null;
          return {
            id: String(item.id),
            product_name: typeof product?.name === "string" ? product.name : null,
            sku: typeof product?.sku === "string" ? product.sku : null,
            model_code: typeof product?.model_code === "string" ? product.model_code : null,
            quantity: typeof item.quantity === "number" ? item.quantity : Number(item.quantity ?? 0),
            cbm: item.cbm === null || item.cbm === undefined ? null : Number(item.cbm),
            dr_number: typeof item.dr_number === "string" ? item.dr_number : null,
          };
        }),
      };
    }),
  ]));
}

const DRIVER_TRIP_STATUS_MAP = [
  { status: "PLANNED", deliveryStatus: "PENDING", label: "Trip assigned" },
  { status: "IN_PROGRESS", deliveryStatus: "IN PROGRESS", label: "On the way" },
  { status: "IN_PROGRESS", deliveryStatus: "IN PROGRESS", label: "At delivery stop" },
  { status: "IN_PROGRESS", deliveryStatus: "IN PROGRESS", label: "Unloading" },
  { status: "COMPLETED", deliveryStatus: "COMPLETED", label: "Delivered" },
] as const;

async function getDriverForProfile(
  profileId: string,
  db: SupabaseClient = supabaseAdmin,
) {
  const { data: driver, error } = await db
    .from("drivers")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) {
    console.error("Driver lookup failed:", error);
    throw new Error("Unable to load driver record.");
  }
  if (!driver?.id) throw new Error("Driver record not found.");
  return String(driver.id);
}

async function assertDriverHasActiveTrip(
  profileId: string,
  tripId: string,
  db: SupabaseClient = supabaseAdmin,
) {
  const driverId = await getDriverForProfile(profileId, db);
  const { data: assignment, error } = await db
    .from("trip_truck_assignments")
    .select("trip_id")
    .eq("driver_id", driverId)
    .eq("trip_id", tripId)
    .is("unassigned_at", null)
    .maybeSingle();
  if (error) {
    console.error("Driver trip assignment lookup failed:", error);
    throw new Error("Unable to verify trip assignment.");
  }
  if (!assignment) {
    throw new Error("This trip is not currently assigned to this driver.");
  }
  const { data: trip, error: tripError } = await db.from("trips")
    .select("id, archived_at").eq("id", tripId).maybeSingle();
  if (tripError) throw new Error("Unable to verify trip archive status.");
  if (!trip || trip.archived_at) throw new Error("This trip has been archived or removed. Refresh your assigned trips.");
  return driverId;
}
export type DriverAssignedTrip = {
  id: string;
  trip_number: string | null;
  dispatch_number: string | null;
  status: string | null;
  departure_from_warehouse_at: string | null;
  loading_date: string | null;
  estimated_delivery_date: string | null;
  origin: string | null;
  origin_latitude: number | null;
  origin_longitude: number | null;
  destination: string | null;
  customer: string | null;
  store: string | null;
  delivery_status: string | null;
  plate_number: string | null;
  assigned_at: string | null;
  driver_status: string | null;
  driver_updated_at: string | null;
  dr_number: string | null;
  pod_image_path: string | null;
  loading_timestamps: {
    warehouse_arrival_at: string | null;
    loading_start_at: string | null;
    loading_finished_at: string | null;
  };
  stops: Array<{
    id: string;
    dispatch_number: string | null;
    dr_number: string | null;
    notes: string | null;
    stop_sequence: number;
    store_name: string | null;
    customer_name: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    delivery_status: string | null;
    arrival_time: string | null;
    start_unloading_time: string | null;
    finish_unloading_time: string | null;
    items: Array<{
      id: string;
      product_name: string | null;
      sku: string | null;
      model_code: string | null;
      quantity: number | null;
      cbm: number | null;
      dr_number: string | null;
    }>;
  }>;
};

export async function getDriverAssignedTrips(
  profileId: string,
): Promise<DriverAssignedTrip[]> {
  const { data: driver, error: driverError } = await supabaseAdmin
    .from("drivers")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (driverError) {
    console.error("Driver lookup for assigned trips failed:", driverError);
    throw new Error("Unable to load assigned trips.");
  }
  if (!driver?.id) return [];

  const { data: assignmentRows, error: assignmentError } = await supabaseAdmin
    .from("trip_truck_assignments")
    .select("trip_id, truck_id, assigned_at")
    .eq("driver_id", String(driver.id))
    .is("unassigned_at", null)
    .order("assigned_at", { ascending: false, nullsFirst: false });

  if (assignmentError) {
    console.error("Assigned trip lookup failed:", assignmentError);
    throw new Error("Unable to load assigned trips.");
  }

  const assignmentsByTrip = new Map<
    string,
    { trip_id: string; truck_id: string | null; assigned_at: string | null }
  >();
  for (const row of assignmentRows ?? []) {
    if (typeof row.trip_id !== "string" || assignmentsByTrip.has(row.trip_id)) {
      continue;
    }
    assignmentsByTrip.set(row.trip_id, {
      trip_id: row.trip_id,
      truck_id: typeof row.truck_id === "string" ? row.truck_id : null,
      assigned_at: typeof row.assigned_at === "string" ? row.assigned_at : null,
    });
  }

  const tripIds = [...assignmentsByTrip.keys()];
  if (tripIds.length === 0) return [];

  const { data: tripRows, error: tripError } = await supabaseAdmin
    .from("trips")
    .select(
      "id, trip_number, dispatch_number, status, loading_date, estimated_delivery_date, departure_from_warehouse_at, archived_at, trip_stops(id, archived_at)",
    )
    .in("id", tripIds);

  if (tripError) {
    console.error("Assigned trip details lookup failed:", tripError);
    throw new Error("Unable to load assigned trip details.");
  }

  const tripMap = new Map(
    (tripRows ?? []).map((trip) => [String(trip.id), trip]),
  );
  const stopsByTrip = await getDriverTripStops(tripIds);
  const [
    { data: updateRows, error: updatesError },
    { data: loadingRows, error: loadingError },
  ] = await Promise.all([
    supabaseAdmin
      .from("driver_trip_updates")
      .select("trip_id, status, updated_at, dr_number, pod_image_path")
      .in("trip_id", tripIds)
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("loading_reports")
      .select("trip_id, warehouse_arrival_at, loading_start_at, loading_finished_at")
      .in("trip_id", tripIds),
  ]);
  if (updatesError) {
    console.error("Driver trip detail lookup failed:", updatesError);
    throw new Error(
      "Unable to load saved driver trip details. Apply backend/migrations/2026_10_15_create_driver_trip_updates.sql in Supabase and retry.",
    );
  }
  if (loadingError) {
    console.error("Assigned trip loading timestamps lookup failed:", loadingError);
    throw new Error("Unable to load warehouse loading progress for your trips.");
  }
  const latestUpdateByTrip = new Map<string, Record<string, unknown>>();
  for (const row of updateRows ?? []) {
    if (
      typeof row.trip_id === "string" &&
      !latestUpdateByTrip.has(row.trip_id)
    ) {
      latestUpdateByTrip.set(row.trip_id, row as Record<string, unknown>);
    }
  }
  const loadingByTrip = new Map((loadingRows ?? []).map((row) => [
    String(row.trip_id),
    row,
  ]));
  const truckIds = [...new Set(
    [...assignmentsByTrip.values()]
      .map((assignment) => assignment.truck_id)
      .filter((id): id is string => Boolean(id)),
  )];
  const truckMap = await getTruckMap(truckIds);

  return Promise.all(
    [...assignmentsByTrip.values()].flatMap((assignment) => {
      const trip = tripMap.get(assignment.trip_id);
      if (!trip || trip.archived_at ||
        (trip.trip_stops.length > 0 && trip.trip_stops.every((stop) => Boolean(stop.archived_at)))) return [];

      return [
        (async (): Promise<DriverAssignedTrip> => {
          const route = await getTripStopRoute(assignment.trip_id, true);
          const activeStops = stopsByTrip.get(assignment.trip_id) ?? [];
          const deliveryStatus = activeStops[activeStops.length - 1]?.delivery_status ?? null;
          const truck = assignment.truck_id
            ? truckMap.get(assignment.truck_id)
            : null;
          const latestUpdate = latestUpdateByTrip.get(assignment.trip_id);
          const loading = loadingByTrip.get(assignment.trip_id);

          return {
            id: assignment.trip_id,
            trip_number:
              trip.trip_number === null || trip.trip_number === undefined
                ? null
                : String(trip.trip_number),
            dispatch_number:
              typeof trip.dispatch_number === "string"
                ? trip.dispatch_number
                : null,
            status: typeof trip.status === "string" ? trip.status : null,
            departure_from_warehouse_at:
              typeof trip.departure_from_warehouse_at === "string"
                ? trip.departure_from_warehouse_at
                : null,
            loading_date:
              typeof trip.loading_date === "string" ? trip.loading_date : null,
            estimated_delivery_date:
              typeof trip.estimated_delivery_date === "string"
                ? trip.estimated_delivery_date
                : null,
            origin: route.origin,
            origin_latitude: route.origin_latitude,
            origin_longitude: route.origin_longitude,
            destination: route.destination,
            customer: route.customer,
            store: route.store,
            delivery_status: deliveryStatus,
            plate_number:
              truck && typeof truck.plate_number === "string"
                ? truck.plate_number
                : null,
            assigned_at: assignment.assigned_at,
            driver_status:
              typeof latestUpdate?.status === "string"
                ? latestUpdate.status
                : null,
            driver_updated_at:
              typeof latestUpdate?.updated_at === "string"
                ? latestUpdate.updated_at
                : null,
            dr_number:
              typeof latestUpdate?.dr_number === "string"
                ? latestUpdate.dr_number
                : null,
            pod_image_path:
              typeof latestUpdate?.pod_image_path === "string"
                ? latestUpdate.pod_image_path
                : null,
            loading_timestamps: {
              warehouse_arrival_at:
                typeof loading?.warehouse_arrival_at === "string"
                  ? loading.warehouse_arrival_at
                  : null,
              loading_start_at:
                typeof loading?.loading_start_at === "string"
                  ? loading.loading_start_at
                  : null,
              loading_finished_at:
                typeof loading?.loading_finished_at === "string"
                  ? loading.loading_finished_at
                  : null,
            },
            stops: stopsByTrip.get(assignment.trip_id) ?? [],
          };
        })(),
      ];
    }),
  );
}

export async function updateDriverTripStatus(
  profileId: string,
  input: {
    trip_id?: string | null;
    trip_stop_id?: string | null;
    step?: number | string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    dr_number?: string | null;
    pod_image_path?: string | null;
    notes?: string | null;
  },
) {
  if (!profileId) {
    throw new Error("Driver profile is required.");
  }

  const tripId =
    typeof input.trip_id === "string" ? input.trip_id.trim() : "";
  if (!tripId) {
    throw new Error("Trip id is required.");
  }

  const detailsOnly = input.step === undefined || input.step === null;
  const stepIndex = detailsOnly ? 0 : Number(input.step);
  if (
    !detailsOnly && (!Number.isInteger(stepIndex) ||
    stepIndex < 1 ||
    stepIndex >= DRIVER_TRIP_STATUS_MAP.length)
  ) {
    throw new Error("A valid trip progress update is required.");
  }
  const step = DRIVER_TRIP_STATUS_MAP[stepIndex];
  const latitude = input.latitude === null || input.latitude === undefined || input.latitude === ""
    ? null
    : Number(input.latitude);
  const longitude = input.longitude === null || input.longitude === undefined || input.longitude === ""
    ? null
    : Number(input.longitude);
  if (
    (latitude === null) !== (longitude === null) ||
    (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
    (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
  ) {
    throw new Error("A valid GPS location is required to start the trip.");
  }
  if (stepIndex === 1 && (latitude === null || longitude === null)) {
    throw new Error("Allow location access or add coordinates to the origin warehouse before starting this trip.");
  }
  const driverId = await assertDriverHasActiveTrip(profileId, tripId);
  const timestamp = new Date().toISOString();

  const requestedStopId = typeof input.trip_stop_id === "string" ? input.trip_stop_id.trim() : "";
  if (!requestedStopId) throw new Error("Choose the delivery stop to update.");
  const { data: stopRows, error: stopLookupError } = await supabaseAdmin
    .from("trip_stops")
    .select("id, delivery_status, archived_at")
    .eq("trip_id", tripId)
    .order("stop_sequence", { ascending: true });

  if (stopLookupError) {
    console.error("Trip stop lookup failed:", stopLookupError);
    throw new Error("Unable to update delivery status.");
  }

  if (!stopRows?.length) {
    throw new Error("This trip has no delivery stop to update.");
  }
  const tripStopId = stopRows.find((stop) => String(stop.id) === requestedStopId)?.id;
  if (!tripStopId) throw new Error("Choose a delivery stop that belongs to this trip.");
  const selectedStop = stopRows.find((stop) => stop.id === tripStopId)!;
  if (selectedStop.archived_at) throw new Error("This dispatch has been archived. Refresh your assigned trips.");
  const drNumber = typeof input.dr_number === "string" ? input.dr_number.trim() : "";
  if (drNumber.length > 100) throw new Error("DR number must be 100 characters or fewer.");
  if (typeof input.notes === "string" && input.notes.length > 2000) throw new Error("Notes must be 2000 characters or fewer.");
  if (detailsOnly && input.dr_number === undefined && input.notes === undefined) throw new Error("Enter a DR number or delivery notes to save.");

  if (stepIndex >= 2 || input.dr_number !== undefined || input.notes !== undefined) {
    const stopUpdate: Record<string, string | null> = {};
    if (stepIndex >= 2) stopUpdate.delivery_status = step.deliveryStatus;
    if (input.dr_number !== undefined) stopUpdate.dr_number = drNumber || null;
    if (typeof input.notes === "string") stopUpdate.remarks = input.notes.trim() || null;
    if (stepIndex === 2) stopUpdate.arrival_time = timestamp;
    if (stepIndex === 3) stopUpdate.start_unloading_time = timestamp;
    if (stepIndex === 4) stopUpdate.finish_unloading_time = timestamp;

    const { error: stopUpdateError } = await supabaseAdmin
      .from("trip_stops")
      .update(stopUpdate)
      .eq("id", tripStopId)
      .eq("trip_id", tripId);

    if (stopUpdateError) {
      console.error("Trip stop update failed:", stopUpdateError);
      throw new Error("Unable to update delivery status.");
    }
  }

  if (input.dr_number !== undefined) {
    const { error: lineItemError } = await supabaseAdmin
      .from("trip_line_items")
      .update({ dr_number: drNumber || null })
      .eq("trip_stop_id", tripStopId)
      .eq("trip_id", tripId);
    if (lineItemError) {
      console.error("Delivery receipt number update failed:", lineItemError);
      throw new Error("Unable to save delivery receipt number.");
    }
  }

  const { data: currentTrip, error: currentTripError } = await supabaseAdmin.from("trips")
    .select("status").eq("id", tripId).maybeSingle();
  if (currentTripError || !currentTrip) throw new Error("Unable to load current trip status.");
  let tripStatus = detailsOnly ? String(currentTrip.status ?? "PLANNED") : step.status;
  if (stepIndex === 4) {
    const { data: refreshedStops, error: refreshedStopsError } = await supabaseAdmin
      .from("trip_stops")
      .select("delivery_status")
      .eq("trip_id", tripId)
      .is("archived_at", null);
    if (refreshedStopsError) {
      console.error("Trip completion check failed:", refreshedStopsError);
      throw new Error("Delivery was saved, but trip completion could not be verified.");
    }
    const everyStopDelivered = Boolean(refreshedStops?.length) &&
      refreshedStops.every((stop) => String(stop.delivery_status ?? "").toUpperCase() === "COMPLETED");
    tripStatus = everyStopDelivered ? "COMPLETED" : "IN_PROGRESS";
  }
  const { error: tripUpdateError } = detailsOnly ? { error: null } : await supabaseAdmin
    .from("trips")
    .update({
      status: tripStatus,
      ...(stepIndex === 1 ? { departure_from_warehouse_at: timestamp } : {}),
      updated_at: timestamp,
    })
    .eq("id", tripId);
  if (tripUpdateError) {
    console.error("Trip status update failed:", tripUpdateError);
    throw new Error("Delivery progress was saved, but trip status could not be updated.");
  }

  if (latitude !== null && longitude !== null) {
    const { error: locationEventError } = await supabaseAdmin
      .from("trip_events")
      .insert({
        trip_id: tripId,
        trip_stop_id: stepIndex > 1 ? tripStopId : null,
        event_type: stepIndex === 1 ? "WAREHOUSE_DEPARTURE" : "GPS_UPDATE",
        event_time: timestamp,
        recorded_by: profileId,
        latitude,
        longitude,
        notes: stepIndex === 1 ? "Trip started from the driver portal." : "Driver location update.",
      });
    if (locationEventError) {
      console.error("Driver trip location could not be recorded:", locationEventError);
      throw new Error(stepIndex === 1
        ? "Trip status was updated, but the truck location could not be shown on the admin map."
        : "Trip progress was updated, but the truck location could not be refreshed on the admin map.");
    }
  }

  const { error: auditError } = await supabaseAdmin
    .from("driver_trip_updates")
    .insert({
      trip_id: tripId,
      driver_id: driverId,
      status: detailsOnly ? "Details updated" : step.label,
      delivery_status: detailsOnly ? selectedStop.delivery_status : step.deliveryStatus,
      dr_number: drNumber || null,
      pod_image_path:
        typeof input.pod_image_path === "string" && input.pod_image_path.trim()
          ? input.pod_image_path.trim()
          : null,
      notes:
        typeof input.notes === "string" && input.notes.trim()
          ? input.notes.trim()
          : null,
      updated_at: timestamp,
    });

  if (auditError) {
    console.error("Driver trip update could not be recorded:", auditError);
    throw new Error(
      "Trip progress was updated, but the driver details could not be recorded. Check the driver_trip_updates Supabase migration.",
    );
  }

  return {
    trip_id: tripId,
    trip_stop_id: String(tripStopId),
    driver_id: driverId,
    status: detailsOnly ? "Details updated" : step.label,
    delivery_status: detailsOnly ? selectedStop.delivery_status : step.deliveryStatus,
    trip_status: tripStatus,
    updated_at: timestamp,
  };
}

export async function saveDriverTripReceipt(
  profileId: string,
  tripId: string,
  tripStopId: string,
  bytes: Buffer,
  contentType: string,
  fileName: string,
  drNumber: string,
) {
  const driverId = await assertDriverHasActiveTrip(profileId, tripId);
  const { data: receiptStop, error: receiptStopError } = await supabaseAdmin.from("trip_stops")
    .select("id, archived_at, dr_number, delivery_status, finish_unloading_time").eq("id", tripStopId).eq("trip_id", tripId).maybeSingle();
  if (receiptStopError) throw new Error("Unable to verify delivery stop.");
  if (!receiptStop || receiptStop.archived_at) throw new Error("This dispatch has been archived or removed. Refresh your assigned trips.");
  const cleanDrNumber = drNumber.trim();
  if (!cleanDrNumber || cleanDrNumber.length > 100) {
    throw new Error("Enter a valid delivery receipt number.");
  }
  const receiptOnly = String(receiptStop.delivery_status).toUpperCase() === "COMPLETED";
  if (receiptOnly && (!receiptStop.dr_number || String(receiptStop.dr_number).trim() !== cleanDrNumber)) {
    throw new Error("Use the completed transaction's saved DR number. Ask dispatch to correct its DR before resubmitting.");
  }

  const image = await uploadTripImage(tripId, bytes, contentType, fileName, { stopId: tripStopId, profileId, drNumber: cleanDrNumber });
  try {
    if (receiptOnly) {
      const { data: trip, error: tripError } = await supabaseAdmin.from("trips").select("status").eq("id", tripId).maybeSingle();
      if (tripError || !trip) throw new Error("Unable to confirm the transaction's current status.");
      const timestamp = new Date().toISOString();
      const { error: auditError } = await supabaseAdmin.from("driver_trip_updates").insert({
        trip_id:tripId,driver_id:driverId,status:"Details updated",delivery_status:receiptStop.delivery_status,
        dr_number:receiptStop.dr_number,pod_image_path:image.storage_path,notes:"Receipt resubmitted for review; delivery milestones unchanged.",updated_at:timestamp,
      });
      if (auditError) throw new Error("The receipt resubmission could not be recorded. Please retry.");
      return {trip_id:tripId,trip_stop_id:tripStopId,driver_id:driverId,status:"Delivered",delivery_status:receiptStop.delivery_status,
        trip_status:trip.status,updated_at:timestamp,receipt_only:true,finish_unloading_time:receiptStop.finish_unloading_time,
        receipt_id:image.id,storage_path:image.storage_path,file_name:image.file_name,signed_url:image.signed_url};
    }
    const update = await updateDriverTripStatus(profileId, {
      trip_id: tripId,
      trip_stop_id: tripStopId,
      step: 4,
      dr_number: cleanDrNumber,
      pod_image_path: image.storage_path,
    });
    return {
      ...update,
      receipt_only:false,
      finish_unloading_time:update.updated_at,
      receipt_id: image.id,
      storage_path: image.storage_path,
      file_name: image.file_name,
      signed_url: image.signed_url,
    };
  } catch (error) {
    try {
      await deleteTripImage(tripId, String(image.id));
    } catch (cleanupError) {
      console.error("POD image cleanup failed after receipt save error:", cleanupError);
    }
    throw error;
  }
}

export async function saveDriverReceiptOcr(profileId: string, tripId: string, stopId: string, input: Record<string, unknown>) {
  await assertDriverHasActiveTrip(profileId, tripId);
  const { data: stop, error } = await supabaseAdmin.from("trip_stops").select("id, archived_at")
    .eq("trip_id", tripId).eq("id", stopId).maybeSingle();
  if (error) throw new Error("Unable to verify delivery stop.");
  if (!stop || stop.archived_at) throw new Error("This dispatch has been archived or removed. Refresh your assigned trips.");
  return storeDriverReceiptText(tripId, stopId, profileId, input);
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
    const searchFilter = buildIlikeOrFilter(
      ["first_name", "last_name", "contact_number"],
      search,
    );
    if (searchFilter) driverQuery = driverQuery.or(searchFilter);
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
        trip && typeof trip.dispatch_number === "string"
          ? String(trip.dispatch_number)
          : trip && typeof trip.trip_number === "string"
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
