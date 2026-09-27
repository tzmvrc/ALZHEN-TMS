import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = (
  process.env.API_BASE_URL ?? "http://localhost:5000"
).replace(/\/$/, "");
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL?.trim();
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const TEST_TRUCKER_EMAIL = process.env.TEST_TRUCKER_EMAIL?.trim();
const TEST_TRUCKER_PASSWORD = process.env.TEST_TRUCKER_PASSWORD;

const results: Array<{
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}> = [];

function mask(value?: string) {
  if (!value) return "not supplied";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-2)}`;
}

async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string,
) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
  };
}

function record(
  name: string,
  status: "PASS" | "FAIL" | "SKIP",
  detail: string,
) {
  results.push({ name, status, detail });
}

function printResults() {
  const counts = {
    PASS: results.filter((entry) => entry.status === "PASS").length,
    FAIL: results.filter((entry) => entry.status === "FAIL").length,
    SKIP: results.filter((entry) => entry.status === "SKIP").length,
  };

  console.log("\nAPI verification summary");
  console.log(`PASS=${counts.PASS} FAIL=${counts.FAIL} SKIP=${counts.SKIP}`);
  for (const entry of results) {
    console.log(`${entry.status} ${entry.name} — ${entry.detail}`);
  }
}

async function loginAndGetToken(
  email: string | undefined,
  password: string | undefined,
  label: string,
) {
  if (!email || !password) {
    record(`${label} login`, "SKIP", "credentials not supplied");
    return null;
  }

  const loginRes = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const token =
    (loginRes.payload as any)?.data?.session?.access_token ??
    (loginRes.payload as any)?.data?.access_token ??
    null;

  if (!loginRes.ok || !token) {
    record(
      `${label} login`,
      "FAIL",
      `HTTP ${loginRes.status} and no valid access token returned`,
    );
    return null;
  }

  record(
    `${label} login`,
    "PASS",
    `HTTP ${loginRes.status} with token present`,
  );
  return token;
}

async function run() {
  console.log(`Testing backend at ${API_BASE_URL}`);

  const adminToken = await loginAndGetToken(
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    "Admin",
  );
  if (!adminToken) {
    if (TEST_ADMIN_EMAIL || TEST_ADMIN_PASSWORD) {
      record(
        "Admin /api/auth/me",
        "SKIP",
        "login failed; protected checks were not executed",
      );
    }
  } else {
    const meRes = await apiRequest(
      "/api/auth/me",
      { method: "GET" },
      adminToken,
    );
    const meOk = meRes.ok && Boolean((meRes.payload as any)?.data?.profile);
    const profileRole =
      (meRes.payload as any)?.data?.profile?.role ?? "unknown";
    if (meOk) {
      record(
        "Admin /api/auth/me",
        "PASS",
        `HTTP ${meRes.status}; role=${profileRole}`,
      );
    } else {
      record(
        "Admin /api/auth/me",
        "FAIL",
        `HTTP ${meRes.status}; missing profile or role`,
      );
    }

    const reportChecks = [
      "/api/reports/combined",
      "/api/reports/dispatch-monitoring",
      "/api/reports/dispatch",
      "/api/reports/trip-booking",
      "/api/reports/store-calling",
      "/api/trips",
    ];

    for (const path of reportChecks) {
      const res = await apiRequest(path, { method: "GET" }, adminToken);
      const ok =
        res.ok &&
        !!(res.payload as any)?.success &&
        !!(res.payload as any)?.data;
      const message = (res.payload as any)?.message ?? "no message";
      if (ok) {
        const data = (res.payload as any)?.data;
        if (data?.rows && Array.isArray(data.rows)) {
          record(
            `${path}`,
            "PASS",
            `HTTP ${res.status}; rows=${data.rows.length}`,
          );
        } else {
          record(`${path}`, "PASS", `HTTP ${res.status}; data present`);
        }
      } else {
        record(`${path}`, "FAIL", `HTTP ${res.status}; ${message}`);
      }
    }

    const reportKeys = [
      "combined",
      "dispatch-monitoring",
      "dispatch",
      "trip-booking",
      "store-calling",
    ];
    for (const reportKey of reportKeys) {
      const res = await apiRequest(
        `/api/reports/${reportKey}/columns`,
        { method: "GET" },
        adminToken,
      );
      const columns = (res.payload as any)?.data?.columns ?? [];
      if (res.ok && Array.isArray(columns) && columns.length > 0) {
        const required = [
          "trip_id",
          "trip_stop_id",
          "trip_line_item_id",
        ].filter((column) => (reportKey === "combined" ? true : true));
        const missing =
          reportKey === "combined"
            ? required.filter(
                (column) => !columns.some((item: any) => item.key === column),
              )
            : [];
        if (missing.length === 0) {
          record(
            `GET /api/reports/${reportKey}/columns`,
            "PASS",
            `HTTP ${res.status}; columns=${columns.length}`,
          );
        } else {
          record(
            `GET /api/reports/${reportKey}/columns`,
            "FAIL",
            `missing required columns: ${missing.join(", ")}`,
          );
        }
      } else {
        record(
          `GET /api/reports/${reportKey}/columns`,
          "FAIL",
          `HTTP ${res.status}; no metadata returned`,
        );
      }
    }

    const tripsRes = await apiRequest(
      "/api/trips?page=1&limit=2",
      { method: "GET" },
      adminToken,
    );
    if (tripsRes.ok && (tripsRes.payload as any)?.data?.rows) {
      const rows = (tripsRes.payload as any).data.rows as Array<
        Record<string, unknown>
      >;
      record(
        "GET /api/trips?page=1&limit=2",
        "PASS",
        `HTTP ${tripsRes.status}; rows=${rows.length}`,
      );
      if (rows.length > 0) {
        const tripId = (rows[0] as any)?.id ?? null;
        if (tripId) {
          const tripDetails = await apiRequest(
            `/api/trips/${tripId}`,
            { method: "GET" },
            adminToken,
          );
          const tripStops = await apiRequest(
            `/api/trips/${tripId}/stops`,
            { method: "GET" },
            adminToken,
          );
          const tripLineItems = await apiRequest(
            `/api/trips/${tripId}/line-items`,
            { method: "GET" },
            adminToken,
          );
          const tripEvents = await apiRequest(
            `/api/trips/${tripId}/events`,
            { method: "GET" },
            adminToken,
          );

          record(
            `GET /api/trips/${tripId}`,
            tripDetails.ok ? "PASS" : "FAIL",
            `HTTP ${tripDetails.status}`,
          );
          record(
            `GET /api/trips/${tripId}/stops`,
            tripStops.ok ? "PASS" : "FAIL",
            `HTTP ${tripStops.status}`,
          );
          record(
            `GET /api/trips/${tripId}/line-items`,
            tripLineItems.ok ? "PASS" : "FAIL",
            `HTTP ${tripLineItems.status}`,
          );
          record(
            `GET /api/trips/${tripId}/events`,
            tripEvents.ok ? "PASS" : "FAIL",
            `HTTP ${tripEvents.status}`,
          );
        }
      }
    } else {
      record(
        "GET /api/trips?page=1&limit=2",
        "FAIL",
        `HTTP ${tripsRes.status}; ${String((tripsRes.payload as any)?.message ?? "missing trip data")}`,
      );
    }

    const invalidAuth = await apiRequest("/api/reports/combined", {
      method: "GET",
    });
    record(
      "No JWT report access",
      invalidAuth.status === 401 ? "PASS" : "FAIL",
      `HTTP ${invalidAuth.status}`,
    );

    const invalidToken = await apiRequest(
      "/api/reports/combined",
      { method: "GET" },
      "not-a-valid-token",
    );
    record(
      "Invalid JWT report access",
      invalidToken.status === 401 ? "PASS" : "FAIL",
      `HTTP ${invalidToken.status}`,
    );
  }

  const truckerToken = await loginAndGetToken(
    TEST_TRUCKER_EMAIL,
    TEST_TRUCKER_PASSWORD,
    "Trucker",
  );
  if (!truckerToken) {
    record("Trucker authorization test", "SKIP", "credentials not supplied");
  } else {
    const res = await apiRequest(
      "/api/reports/combined",
      { method: "GET" },
      truckerToken,
    );
    record(
      "Trucker authorization test",
      res.status === 403 ? "PASS" : "FAIL",
      `HTTP ${res.status}`,
    );
  }

  const invalidUuidRes = await apiRequest(
    "/api/trips/not-a-uuid",
    { method: "GET" },
    adminToken ?? "",
  );
  if (invalidUuidRes.status === 400 || invalidUuidRes.status === 404) {
    record("Invalid UUID validation", "PASS", `HTTP ${invalidUuidRes.status}`);
  } else {
    record("Invalid UUID validation", "FAIL", `HTTP ${invalidUuidRes.status}`);
  }

  const missingTripRes = await apiRequest(
    "/api/trips/11111111-1111-4111-8111-111111111111",
    { method: "GET" },
    adminToken ?? "",
  );
  if (missingTripRes.status === 404) {
    record("Missing trip validation", "PASS", `HTTP ${missingTripRes.status}`);
  } else {
    record("Missing trip validation", "FAIL", `HTTP ${missingTripRes.status}`);
  }

  console.log(`Admin email: ${mask(TEST_ADMIN_EMAIL)}`);
  console.log(`Trucker email: ${mask(TEST_TRUCKER_EMAIL)}`);
  printResults();
}

run().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Unknown verification error";
  console.error("Verification script crashed:", message);
  process.exit(1);
});
