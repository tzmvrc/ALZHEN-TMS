export interface TripRecord {
  id: string;
  dispatch_number: string | null;
  trip_type_id: string | null;
  warehouse_id: string | null;
  loading_date: string | null;
  estimated_delivery_date: string | null;
  status: string | null;
  authorization_letter: string | null;
  page_no: number | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  transaction_number: string | null;
  trip_number: number | null;
  trip_reference?: string | null;
  added_to_report: boolean | null;
  letter_status: string | null;
  truck_allocated_by: string | null;
  subcon_rate_manual: number | null;
  signed_dr_upload_date: string | null;
  transmittal_date: string | null;
  tms_date: string | null;
  tms_done_by: string | null;
  pod_ac_shipping_date: string | null;
  lbc_tracking_number: string | null;
  request_received_at: string | null;
  departure_from_warehouse_at: string | null;
}

export interface TripTypeRef {
  id: string | null;
  code?: string | null;
  name?: string | null;
}

export interface TripWarehouseRef {
  id: string | null;
  code?: string | null;
  name?: string | null;
}

export interface TripProfileRef {
  id: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}

export interface TripDetail {
  trip: TripRecord;
  trip_type: TripTypeRef | null;
  warehouse: TripWarehouseRef | null;
  created_by_profile: TripProfileRef | null;
  tms_done_by_profile: TripProfileRef | null;
}

export interface TripListQuery {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  loading_date_from?: string;
  loading_date_to?: string;
  warehouse_id?: string;
  trip_type_id?: string;
  sort_by?: string;
  sort_order?: string;
  [key: string]: string | string[] | undefined;
}

export interface TripListResponse {
  rows: TripRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type TripCreateInput = Partial<TripRecord> & {
  dispatch_number?: string | null;
  trip_type_id?: string | null;
  warehouse_id?: string | null;
  loading_date?: string | null;
  estimated_delivery_date?: string | null;
  status?: string | null;
  authorization_letter?: string | null;
  page_no?: number | null;
  remarks?: string | null;
  transaction_number?: string | null;
  trip_number?: number | null;
  added_to_report?: boolean | null;
  letter_status?: string | null;
  truck_allocated_by?: string | null;
  subcon_rate_manual?: number | null;
  signed_dr_upload_date?: string | null;
  transmittal_date?: string | null;
  tms_date?: string | null;
  tms_done_by?: string | null;
  pod_ac_shipping_date?: string | null;
  lbc_tracking_number?: string | null;
  request_received_at?: string | null;
  departure_from_warehouse_at?: string | null;
};

export type TripUpdateInput = Partial<TripCreateInput> & {
  created_by?: never;
};

export type TripQueryParams = TripListQuery;
