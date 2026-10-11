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

const AUTH_SESSION_EXPIRED_PATTERNS = [
  /bad_jwt/i,
  /invalid jwt/i,
  /jwt expired/i,
  /token is expired/i,
  /token expired/i,
  /invalid or expired token/i,
  /invalid token/i,
  /session is expired/i,
  /auth session is null/i,
  /authentication token/i,
];

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

type SessionExpiredHandler = (reason?: string) => Promise<void> | void;

let sessionExpiredHandler: SessionExpiredHandler | null = null;
let sessionExpiredRequestInFlight = false;

export function registerSessionExpiredHandler(handler: SessionExpiredHandler) {
  sessionExpiredHandler = handler;
}

export function unregisterSessionExpiredHandler() {
  sessionExpiredHandler = null;
}

async function triggerSessionExpired(reason?: string) {
  if (sessionExpiredRequestInFlight) {
    return;
  }

  sessionExpiredRequestInFlight = true;

  try {
    if (sessionExpiredHandler) {
      await sessionExpiredHandler(reason);
    }
  } finally {
    sessionExpiredRequestInFlight = false;
  }
}

const APP_SESSION_STORAGE_KEY = "alzhen.app-session.v1";
let memoryAppSessionId: string | null = null;

function readAppSessionId(): string | null {
  try {
    return window.localStorage.getItem(APP_SESSION_STORAGE_KEY) ?? memoryAppSessionId;
  } catch {
    return memoryAppSessionId;
  }
}

export function getAppSessionHeaders(): Record<string, string> {
  const sessionId = readAppSessionId();
  return sessionId ? { "X-App-Session": sessionId } : {};
}

export function setAppSessionId(sessionId: string) {
  memoryAppSessionId = sessionId;
  try {
    window.localStorage.setItem(APP_SESSION_STORAGE_KEY, sessionId);
  } catch {
    throw new Error("This browser cannot retain the secure sign-in session. Enable site storage and sign in again.");
  }
}

export function clearAppSessionId() {
  memoryAppSessionId = null;
  try {
    window.localStorage.removeItem(APP_SESSION_STORAGE_KEY);
  } catch {
    // Session cleanup must still clear in-memory auth state when storage is unavailable.
  }
}

function hasExpiredSessionSignal(status: number, payload: unknown): boolean {
  if (status === 401) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  const flattened = JSON.stringify(payload ?? {})
    .replace(/"/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!flattened) {
    return false;
  }

  return AUTH_SESSION_EXPIRED_PATTERNS.some((pattern) =>
    pattern.test(flattened),
  );
}

export async function handleSessionExpiredResponse(
  status: number,
  payload: unknown,
  authenticatedRequest = true,
): Promise<boolean> {
  if (!authenticatedRequest || !hasExpiredSessionSignal(status, payload)) return false;
  const reason = (payload as { code?: unknown } | null)?.code;
  await triggerSessionExpired(typeof reason === "string" ? reason : undefined);
  return true;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    for (const [name, value] of Object.entries(getAppSessionHeaders())) {
      headers.set(name, value);
    }
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
    code?: string;
    message?: string;
    data?: T;
  } | null;

  if (!response.ok) {
    if (await handleSessionExpiredResponse(response.status, payload, Boolean(token))) {
      throw new ApiError(payload?.message ?? "Your session has expired. Please log in again.", 401);
    }

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
      throw new ApiError(
        payload?.message ?? "Resource not found.",
        response.status,
      );
    }

    if (response.status >= 500) {
      throw new ApiError(
        "Something went wrong. Please try again later.",
        response.status,
      );
    }

    throw new ApiError(payload?.message ?? "Request failed", response.status);
  }

  return (payload ?? ({} as T)) as T;
}

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const cachedRequests = new Map<string, Promise<unknown>>();
const cacheRevisions = new Map<string, number>();

export function invalidateApiCache(prefix?: string) {
  const keys = new Set([...responseCache.keys(), ...cachedRequests.keys()]);
  for (const key of keys) {
    if (!prefix || key.includes(prefix)) {
      const hasPendingRequest = cachedRequests.has(key);
      responseCache.delete(key);
      cachedRequests.delete(key);
      if (hasPendingRequest) cacheRevisions.set(key, (cacheRevisions.get(key) ?? 0) + 1);
      else cacheRevisions.delete(key);
    }
  }
}

export function clearApiCache() {
  invalidateApiCache();
}

export async function apiGet<T>(endpoint: string, token?: string): Promise<T> {
  return request<T>(endpoint, { method: "GET" }, token);
}

export async function apiGetCached<T>(
  endpoint: string,
  token?: string,
  ttlMs = 5 * 60 * 1000,
): Promise<T> {
  const cacheKey = `${token ?? "anon"}:${endpoint}`;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const pending = cachedRequests.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const requestRevision = cacheRevisions.get(cacheKey) ?? 0;
  const requestPromise = request<T>(endpoint, { method: "GET" }, token)
    .then((value) => {
      if (requestRevision === (cacheRevisions.get(cacheKey) ?? 0)) {
        responseCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, value });
      }
      return value;
    })
    .finally(() => {
      if (cachedRequests.get(cacheKey) === requestPromise) cachedRequests.delete(cacheKey);
      if (
        !cachedRequests.has(cacheKey) &&
        !responseCache.has(cacheKey) &&
        requestRevision !== (cacheRevisions.get(cacheKey) ?? 0)
      ) cacheRevisions.delete(cacheKey);
    });
  cachedRequests.set(cacheKey, requestPromise);
  return requestPromise;
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

export async function apiPatch<T>(
  endpoint: string,
  body: unknown,
  token?: string,
): Promise<T> {
  return request<T>(
    endpoint,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    token,
  );
}

export async function apiPut<T>(
  endpoint: string,
  body: unknown,
  token?: string,
): Promise<T> {
  return request<T>(
    endpoint,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    token,
  );
}

export async function apiDelete<T>(
  endpoint: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  return request<T>(
    endpoint,
    {
      method: "DELETE",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    token,
  );
}
