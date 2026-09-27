import { apiGet, type ApiResponse } from "./api.service";

export type DatabaseSource = {
  name: string;
  label: string;
  kind: "table" | "view";
};

export type DatabaseSourcePage = {
  source: DatabaseSource;
  columns: string[];
  rows: Record<string, unknown>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function unwrap<T>(response: ApiResponse<T>, fallback: string): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.message ?? fallback);
  }
  return response.data;
}

export async function fetchDatabaseSources(
  token: string,
): Promise<DatabaseSource[]> {
  const response = await apiGet<ApiResponse<DatabaseSource[]>>(
    "/database/sources",
    token,
  );
  return unwrap(response, "Unable to load database sources.");
}

export async function fetchDatabaseSourcePage(
  source: string,
  page: number,
  token: string,
): Promise<DatabaseSourcePage> {
  const params = new URLSearchParams({ page: String(page), limit: "25" });
  const response = await apiGet<ApiResponse<DatabaseSourcePage>>(
    `/database/sources/${encodeURIComponent(source)}?${params.toString()}`,
    token,
  );
  return unwrap(response, "Unable to load database records.");
}