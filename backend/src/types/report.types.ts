export type ReportKey =
  | "combined"
  | "dispatch-monitoring"
  | "dispatch"
  | "trip-booking"
  | "store-calling";

export type ReportColumnType = "text" | "date" | "number" | "boolean";

export interface ReportColumnDefinition {
  key: string;
  title: string;
  type: ReportColumnType;
}

export interface ReportFilterDefinition {
  key: string;
  field: string;
  operator: "eq" | "gte" | "lte";
}

export interface ReportDefinition {
  key: string;
  view: string;
  title: string;
  columns: ReportColumnDefinition[];
  searchableColumns: string[];
  sortableColumns: string[];
  filterableColumns: string[];
  defaultSort: string;
  defaultSortOrder: "asc" | "desc";
  filters: ReportFilterDefinition[];
}

export interface ReportQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  [key: string]: string | string[] | undefined;
}

export interface ReportResponse {
  rows: Record<string, unknown>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
