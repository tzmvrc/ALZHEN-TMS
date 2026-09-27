export interface TripQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  loading_date_from?: string;
  loading_date_to?: string;
  warehouse_id?: string;
  trip_type_id?: string;
  sort_by?: string;
  sort_order?: string;
  [key: string]: string | string[] | undefined;
}

export interface TripListResponse {
  rows: Record<string, unknown>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
