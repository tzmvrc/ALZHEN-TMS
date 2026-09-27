export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    !headers.has("Content-Type") &&
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: T;
  } | null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(
        payload?.message ?? "Your session has expired. Please log in again.",
        response.status,
      );
    }

    if (response.status === 403) {
      throw new ApiError(
        payload?.message ?? "You are not authorized to access this resource.",
        response.status,
      );
    }

    if (response.status === 404) {
      throw new ApiError(payload?.message ?? "Resource not found.", response.status);
    }

    if (response.status >= 500) {
      throw new ApiError("Something went wrong. Please try again later.", response.status);
    }

    throw new ApiError(payload?.message ?? "Request failed", response.status);
  }

  return (payload ?? ({} as T)) as T;
}

export async function apiGet<T>(endpoint: string, token?: string): Promise<T> {
  return request<T>(endpoint, { method: "GET" }, token);
}

export async function apiPost<T>(
  endpoint: string,
  body: unknown,
  token?: string,
): Promise<T> {
  return request<T>(
    endpoint,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    token,
  );
}
