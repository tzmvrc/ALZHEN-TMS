export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

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
      throw new Error(
        payload?.message ?? "Your session has expired. Please log in again.",
      );
    }

    if (response.status === 403) {
      throw new Error(
        payload?.message ?? "You are not authorized to access this resource.",
      );
    }

    if (response.status === 404) {
      throw new Error(payload?.message ?? "Resource not found.");
    }

    if (response.status >= 500) {
      throw new Error("Something went wrong. Please try again later.");
    }

    throw new Error(payload?.message ?? "Request failed");
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
