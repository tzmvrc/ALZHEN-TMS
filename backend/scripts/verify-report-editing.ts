import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = (
  process.env.API_BASE_URL ?? "http://localhost:5000"
).replace(/\/$/, "");
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL?.trim();
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

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

  console.log("\nReport editing verification summary");
  console.log(`PASS=${counts.PASS} FAIL=${counts.FAIL} SKIP=${counts.SKIP}`);
  for (const entry of results) {
    console.log(`${entry.status} ${entry.name} — ${entry.detail}`);
  }
}

async function loginAndGetToken() {
  if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
    record("Admin login", "SKIP", "credentials not supplied");
    return null;
  }

  const loginRes = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD }),
  });

  const token =
    (loginRes.payload as any)?.data?.session?.access_token ??
    (loginRes.payload as any)?.data?.access_token ??
    null;

  if (!loginRes.ok || !token) {
    record(
      "Admin login",
      "FAIL",
      `HTTP ${loginRes.status} and no valid access token returned`,
    );
    return null;
  }

  record("Admin login", "PASS", `HTTP ${loginRes.status} with token present`);
  return token;
}

const REQUIRED_INTERNAL_IDS = {
  combined: [
    "_trip_id", "_trip_stop_id", "_trip_line_item_id", "_trip_type_id",
    "_warehouse_id", "_customer_id", "_store_id", "_truck_id", "_driver_id",
    "_trucking_company_id", "_product_id", "_assignment_id",
    "_truck_allocated_by", "_tms_done_by",
  ],
  "dispatch-monitoring": [
    "_trip_id", "_trip_stop_id", "_trip_type_id", "_warehouse_id",
    "_customer_id", "_store_id", "_truck_id", "_driver_id",
    "_trucking_company_id", "_assignment_id",
  ],
  dispatch: [
    "_trip_id", "_trip_stop_id", "_trip_line_item_id", "_product_id",
    "_warehouse_id", "_customer_id", "_store_id", "_truck_id", "_driver_id",
    "_trucking_company_id", "_assignment_id", "_tms_done_by",
  ],
  "trip-booking": [
    "_trip_id", "_trip_stop_id", "_trip_line_item_id", "_product_id",
    "_trip_type_id", "_warehouse_id", "_customer_id", "_store_id", "_truck_id",
    "_driver_id", "_trucking_company_id", "_assignment_id",
    "_truck_allocated_by", "_tms_done_by", "_billing_id",
  ],
} as const;

const CANONICAL_ID_ALIASES: Record<string, string> = {
  _trip_id: "trip_id",
  _trip_stop_id: "trip_stop_id",
  _trip_line_item_id: "trip_line_item_id",
  _trip_type_id: "trip_type_id",
  _warehouse_id: "warehouse_id",
  _customer_id: "customer_id",
  _store_id: "store_id",
  _truck_id: "truck_id",
  _driver_id: "driver_id",
  _trucking_company_id: "trucking_company_id",
  _product_id: "product_id",
  _assignment_id: "assignment_id",
  _truck_allocated_by: "truck_allocated_by",
  _tms_done_by: "tms_done_by",
  _billing_id: "billing_id",
};

const EDITABLE_ENTITY_BY_COLUMN: Record<
  string,
  "trip" | "stop" | "lineItem" | "assignment" | "billing"
> = {
  dispatch_number: "trip",
  transaction_number: "trip",
  trip_number: "trip",
  loading_date: "trip",
  estimated_delivery_date: "trip",
  trip_status: "trip",
  trip_type: "trip",
  warehouse_code: "trip",
  warehouse_name: "trip",
  wh_code: "trip",
  ship_from: "trip",
  letter_status: "trip",
  added_to_report: "trip",
  truck_allocated_by_name: "trip",
  tms_done_by_name: "trip",
  subcon_rate_manual: "trip",
  signed_dr_upload_date: "trip",
  transmittal_date: "trip",
  tms_date: "trip",
  pod_ac_shipping_date: "trip",
  lbc_tracking_number: "trip",
  remarks: "trip",
  trip_remarks: "trip",
  delivery_status: "stop",
  customer_name: "stop",
  store_name: "stop",
  ship_to: "stop",
  arrival_time: "stop",
  start_unloading_time: "stop",
  finish_unloading_time: "stop",
  departure_time: "stop",
  stop_remarks: "stop",
  trucking_company: "assignment",
  driver_name: "assignment",
  plate_number: "assignment",
  dr_number: "lineItem",
  sap_so_number: "lineItem",
  customer_po_number: "lineItem",
  internal_po_number: "lineItem",
  customer_model: "lineItem",
  quantity: "lineItem",
  cbm: "lineItem",
  item_remarks: "lineItem",
  product_name: "lineItem",
  product_model: "lineItem",
  sku: "lineItem",
  model_code: "lineItem",
  invoice_number: "billing",
};

const EDITABLE_TARGET_IDS = {
  trip: ["trip_id"],
  stop: ["trip_id", "trip_stop_id"],
  lineItem: ["trip_id", "trip_stop_id", "trip_line_item_id"],
  assignment: ["trip_id", "assignment_id"],
  billing: ["trip_id", "billing_id"],
} as const;

async function verifyReportEditingPaths(token: string) {
  const reportKeys = [
    "combined", "dispatch-monitoring", "dispatch", "trip-booking", "store-calling",
  ] as const;

  for (const reportKey of reportKeys) {
    const columnsRes = await apiRequest(
      `/api/reports/${reportKey}/columns`, { method: "GET" }, token,
    );
    if (!columnsRes.ok) {
      record(`${reportKey} columns fetch`, "FAIL", `HTTP ${columnsRes.status}`);
      continue;
    }
    const columns = (columnsRes.payload as any)?.data?.columns ?? [];
    record(`${reportKey} columns fetch`, "PASS", `HTTP ${columnsRes.status}; ${columns.length} columns`);

    const rowsRes = await apiRequest(
      `/api/reports/${reportKey}?page=1&limit=1`, { method: "GET" }, token,
    );
    if (!rowsRes.ok) {
      record(`${reportKey} rows fetch`, "FAIL", `HTTP ${rowsRes.status}`);
      continue;
    }
    const rows = (rowsRes.payload as any)?.data?.rows ?? [];
    if (rows.length === 0) {
      record(`${reportKey} rows fetch`, "SKIP", "No rows available for read-only verification");
      continue;
    }

    const row = rows[0] as Record<string, unknown>;
    record(`${reportKey} rows fetch`, "PASS", `HTTP ${rowsRes.status}; 1 row available`);

    const missingColumns = columns
      .map((column: { key: string }) => column.key)
      .filter((key: string) => !Object.prototype.hasOwnProperty.call(row, key));
    record(
      `${reportKey} configured columns match row fields`,
      missingColumns.length ? "FAIL" : "PASS",
      missingColumns.length ? `Missing row fields: ${missingColumns.join(", ")}` : "All configured column keys exist in the live row",
    );

    if (reportKey === "store-calling") {
      const hasStoreCallId = typeof row.store_call_id === "string" && row.store_call_id.length > 0;
      record(
        "store-calling editable row identity",
        hasStoreCallId ? "PASS" : "FAIL",
        hasStoreCallId ? "Exact store_call_id is present" : "store_call_id is missing",
      );
      continue;
    }

    const expectedIds = REQUIRED_INTERNAL_IDS[reportKey];
    const missingIds = expectedIds.filter(
      (id) => !Object.prototype.hasOwnProperty.call(row, id),
    );
    record(
      `${reportKey} internal ID columns`,
      missingIds.length ? "FAIL" : "PASS",
      missingIds.length ? `Missing fields: ${missingIds.join(", ")}` : `All ${expectedIds.length} internal ID fields are present`,
    );

    const mismatchedAliases = expectedIds
      .filter((id) => row[id] !== null && row[id] !== undefined)
      .filter((id) => row[CANONICAL_ID_ALIASES[id]] !== row[id]);
    record(
      `${reportKey} canonical ID aliases`,
      mismatchedAliases.length ? "FAIL" : "PASS",
      mismatchedAliases.length
        ? `Missing or mismatched aliases for: ${mismatchedAliases.join(", ")}`
        : "Every non-null internal ID has the matching frontend alias",
    );

    const configuredEditableColumns = columns
      .map((column: { key: string }) => column.key)
      .filter((key: string) => EDITABLE_ENTITY_BY_COLUMN[key]);
    const unavailableEditableColumns = configuredEditableColumns.filter(
      (key: string) => {
        const entity = EDITABLE_ENTITY_BY_COLUMN[key];
        const targetIds = EDITABLE_TARGET_IDS[entity];
        const targetId = targetIds[targetIds.length - 1];
        return typeof row[targetId] !== "string" || !row[targetId];
      },
    );
    const invalidEditableTargets = configuredEditableColumns.filter(
      (key: string) => {
        const entity = EDITABLE_ENTITY_BY_COLUMN[key];
        const targetIds = EDITABLE_TARGET_IDS[entity];
        const targetId = targetIds[targetIds.length - 1];
        if (typeof row[targetId] !== "string" || !row[targetId]) return false;
        return EDITABLE_TARGET_IDS[entity].some(
          (id) => typeof row[id] !== "string" || !row[id],
        );
      },
    );
    record(
      `${reportKey} configured editor UUID targets`,
      invalidEditableTargets.length ? "FAIL" : "PASS",
      invalidEditableTargets.length
        ? `Invalid exact target IDs for columns: ${invalidEditableTargets.join(", ")}`
        : `${configuredEditableColumns.length - unavailableEditableColumns.length} editor target(s) ready; ${unavailableEditableColumns.length} unavailable because the row has no related record ID`,
    );
  }
}

async function verifyDropdownOptions(token: string) {
  const dropdownRes = await apiRequest(
    "/api/dropdown-options",
    { method: "GET" },
    token,
  );

  if (!dropdownRes.ok) {
    record("Dropdown options fetch", "FAIL", `HTTP ${dropdownRes.status}`);
    return;
  }

  const options = (dropdownRes.payload as any)?.data ?? [];
  record(
    "Dropdown options fetch",
    "PASS",
    `HTTP ${dropdownRes.status}; ${options.length} options`,
  );

  // Check for required fields
  const fieldKeys = new Set(options.map((opt: any) => opt.field_key));
  const requiredFields = ["trip_status", "delivery_status", "letter_status", "store_call_status", "confirmation_status"];
  const missingFields = requiredFields.filter(field => !fieldKeys.has(field));

  if (missingFields.length > 0) {
    record(
      "Dropdown options required fields",
      "FAIL",
      `Missing: ${missingFields.join(", ")}`,
    );
  } else {
    record(
      "Dropdown options required fields",
      "PASS",
      `All required fields present`,
    );
  }

  // Check letter_status constraint
  const letterOptions = options.filter((opt: any) => opt.field_key === "letter_status");
  const letterValues = letterOptions.map((opt: any) => opt.option_value);
  const expectedLetterValues = ["READY", "SENT", "CANCELLED"];
  const missingLetterValues = expectedLetterValues.filter(v => !letterValues.includes(v));

  if (missingLetterValues.length > 0) {
    record(
      "Letter status constraint",
      "FAIL",
      `Missing system values: ${missingLetterValues.join(", ")}`,
    );
  } else {
    record(
      "Letter status constraint",
      "PASS",
      `All system values present: ${expectedLetterValues.join(", ")}`,
    );
  }
}

async function verifyLookupEndpoints(token: string) {
  const lookupKinds = [
    "trip-types",
    "warehouses",
    "customers",
    "stores",
    "products",
    "drivers",
    "trucks",
    "trucking-companies",
    "assignees",
    "store-contacts",
  ];

  for (const kind of lookupKinds) {
    const res = await apiRequest(
      `/api/lookups/${kind}`,
      { method: "GET" },
      token,
    );

    if (res.ok) {
      const data = (res.payload as any)?.data ?? [];
      record(
        `Lookup ${kind}`,
        "PASS",
        `HTTP ${res.status}; ${data.length} records`,
      );
    } else {
      record(
        `Lookup ${kind}`,
        "FAIL",
        `HTTP ${res.status}`,
      );
    }
  }
}

async function run() {
  console.log(`Running read-only report editing verification at ${API_BASE_URL}`);
  record(
    "Mutation testing",
    "SKIP",
    "No PATCH requests are sent; this helper verifies reads and row identities only",
  );

  const token = await loginAndGetToken();
  if (!token) {
    console.log(`Admin email: ${mask(TEST_ADMIN_EMAIL)}`);
    printResults();
    return;
  }

  await verifyReportEditingPaths(token);
  await verifyDropdownOptions(token);
  await verifyLookupEndpoints(token);

  console.log(`Admin email: ${mask(TEST_ADMIN_EMAIL)}`);
  printResults();
}

run().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Unknown verification error";
  console.error("Verification script crashed:", message);
  process.exit(1);
});
