import { apiGetCached, apiPatch, apiPost, apiUpload, getCachedApiResponse,invalidateApiCache,type ApiResponse } from "./api.service";
import {pdfIntakeAvailable} from "./pdf-intake.service";
import {validatePodUpload} from "./pod-upload-validation";

export type TruckerListItem = {
  id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  status: string | null;
  profile_picture_path: string | null;
  assigned_truck_id: string | null;
  plate_number: string | null;
  active_trip_id: string | null;
  active_trip_number: string | null;
  dr_number?: string | null;
  current_trip_status: string | null;
  delivery_status: string | null;
  loading_date: string | null;
};

export type TruckerDetail = {
  id: string;
  driver_id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  status: string | null;
  profile_picture_path: string | null;
  truck: {
    id: string | null;
    plate_number: string | null;
    truck_number: string | null;
    make: string | null;
    model: string | null;
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
    dr_number?: string | null;
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
  stops: DriverAssignedStop[];
};

export type DriverAssignedStop = {
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
};

export type SavedDriverReceipt = {
  receipt_only?: boolean;
  finish_unloading_time?: string | null;
  receipt_id: string;
  trip_id: string;
  trip_stop_id: string;
  driver_id: string;
  status: string;
  delivery_status: string;
  trip_status: string;
  updated_at: string;
  storage_path: string;
  file_name: string;
  signed_url: string;
};

export async function fetchMyAssignedTrips(
  token: string,
    fresh = false,
): Promise<DriverAssignedTrip[]> {
    if(fresh)invalidateAssignedTrips();
    const response = await apiGetCached<ApiResponse<DriverAssignedTrip[]>>(
    "/truckers/me/trips",
    token,
      30_000, "/truckers/me/trips", 20_000,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load your assigned trips.");
  }

  return response.data;
}

export const invalidateAssignedTrips=()=>invalidateApiCache("/truckers/me/trips");
export const getCachedAssignedTrips=(token:string)=>getCachedApiResponse<ApiResponse<DriverAssignedTrip[]>>("/truckers/me/trips",token,5*60_000)?.data??null;

type TruckerQuery={
  search?: string;
  status?: string;
  assignment?: "all" | "assigned" | "unassigned";
  page?: number;
  limit?: number;
};
export function truckerListEndpoint(params:TruckerQuery){
  const searchParams = new URLSearchParams();
  if (params.search?.trim()) searchParams.set("search", params.search.trim());
  if (params.status && params.status !== "all") searchParams.set("status", params.status);
  if (params.assignment && params.assignment !== "all") searchParams.set("assignment", params.assignment);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  return `/truckers${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
}
export const getCachedTruckers=(token:string,params:TruckerQuery)=>getCachedApiResponse<ApiResponse<{rows:TruckerListItem[];pagination:{totalPages:number}}>>(truckerListEndpoint(params),token,5*60_000)?.data??null;
export async function fetchTruckers(token: string, params:TruckerQuery) {

  const response = await apiGetCached<ApiResponse<{ rows: TruckerListItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>>(
    truckerListEndpoint(params),
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load truckers.");
  }

  return response.data;
}

export async function fetchTruckerDetail(token: string, truckerId: string): Promise<TruckerDetail> {
  const response = await apiGetCached<ApiResponse<TruckerDetail>>(
    `/truckers/${encodeURIComponent(truckerId)}`,
    token,
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to load trucker details.");
  }

  return response.data;
}

export const getCachedTruckerDetail=(token:string,id:string)=>getCachedApiResponse<ApiResponse<TruckerDetail>>(`/truckers/${encodeURIComponent(id)}`,token,300000)?.data??null;
/** Show known summary fields immediately; retain enrichment only for matching identities. */
export function truckerDetailFromSummary(row:TruckerListItem,previous?:TruckerDetail|null):TruckerDetail{
 const old=previous?.id===row.id?previous:null;
 return {id:row.id,driver_id:row.id,profile_id:row.profile_id,first_name:row.first_name,last_name:row.last_name,full_name:row.full_name,contact_number:row.contact_number,email:row.email,status:row.status,profile_picture_path:row.profile_picture_path,
  truck:row.assigned_truck_id?{id:row.assigned_truck_id,plate_number:row.plate_number,truck_number:old?.truck?.id===row.assigned_truck_id?old.truck.truck_number:null,make:old?.truck?.id===row.assigned_truck_id?old.truck.make:null,model:old?.truck?.id===row.assigned_truck_id?old.truck.model:null,status:old?.truck?.id===row.assigned_truck_id?old.truck.status:null}:null,
  active_trip:row.active_trip_id?{id:row.active_trip_id,trip_number:row.active_trip_number,dispatch_number:old?.active_trip?.id===row.active_trip_id?old.active_trip.dispatch_number:null,status:row.current_trip_status,loading_date:row.loading_date,estimated_delivery_date:old?.active_trip?.id===row.active_trip_id?old.active_trip.estimated_delivery_date:null,route:old?.active_trip?.id===row.active_trip_id?old.active_trip.route:null,delivery_status:row.delivery_status,dr_number:row.dr_number??null}:null,
  trip_history:old?.trip_history??[]};
}

export async function saveDriverTripUpdate(
  token: string,
  payload: {
    trip_id: string;
    trip_stop_id: string;
    step?: number | null;
    latitude?: number;
    longitude?: number;
    dr_number?: string | null;
    pod_image_path?: string | null;
    notes?: string | null;
  },
): Promise<{
  trip_id: string;
  trip_stop_id: string;
  driver_id: string;
  status: string;
  delivery_status: string;
  trip_status: string;
  updated_at: string;
}> {
  const response = await apiPost<
    ApiResponse<{
      trip_id: string;
      trip_stop_id: string;
      driver_id: string;
      status: string;
      delivery_status: string;
      trip_status: string;
      updated_at: string;
    }>
  >("/truckers/me/trip-status", payload, token);

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to update trip status.");
  }

  invalidateAssignedTrips();
  return response.data;
}

export async function uploadDriverPod(
  token: string,
  tripId: string,
  stopId: string,
  file: File,
  drNumber: string,
): Promise<SavedDriverReceipt> {
  validatePodUpload(file,file.type==="application/pdf"?await pdfIntakeAvailable(token):false);
  const response = await apiUpload<
    ApiResponse<SavedDriverReceipt>
  >(
    `/truckers/me/trips/${encodeURIComponent(tripId)}/pod`,
    file,
    file.type,
    file.name,
    token,
    { "X-DR-Number": drNumber.trim(), "X-Trip-Stop-Id": stopId },
  );

  if (!response.success || !response.data) {
    throw new Error(response.message ?? "Unable to upload delivery receipt.");
  }
  invalidateAssignedTrips();
  return response.data;
}

/* The text the driver's phone read from the receipt photo. Sent right after the photo is
   saved so dispatch finds it ready to check instead of scanning the image again. */
export async function saveDriverReceiptText(
  token: string,
  tripId: string,
  stopId: string,
  payload: { receipt_id: string; ocr_text: string; ocr_confidence: number | null },
): Promise<void> {
  const response = await apiPatch<ApiResponse<{ trip_stop_id: string }>>(
    `/truckers/me/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/pod/ocr`,
    payload,
    token,
  );
  if (!response.success) {
    throw new Error(response.message ?? "Unable to save receipt text.");
  }
}
