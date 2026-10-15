import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";

const tripId = "223e4567-e89b-42d3-a456-426614174000";
const otherTripId = "623e4567-e89b-42d3-a456-426614174000";
const stopId = "323e4567-e89b-42d3-a456-426614174000";
const otherStopId = "423e4567-e89b-42d3-a456-426614174000";
const offloadId = "523e4567-e89b-42d3-a456-426614174000";
const otherOffloadId = "723e4567-e89b-42d3-a456-426614174000";
const itemId = "823e4567-e89b-42d3-a456-426614174000";
const otherItemId = "923e4567-e89b-42d3-a456-426614174000";
const lineId = "a23e4567-e89b-42d3-a456-426614174000";
const otherTripLineId = "b23e4567-e89b-42d3-a456-426614174000";
const otherStopLineId = "c23e4567-e89b-42d3-a456-426614174000";
const admin = { profileId: "d23e4567-e89b-42d3-a456-426614174000", role: "ADMIN" };

type Row = Record<string, any>;
type Write = { table: string; operation: "update" | "insert"; filters: Array<[string, unknown]>; payload: Row };

async function withDatabase(
  seed: Record<string, Row[]>,
  action: (context: { tables: Record<string, Row[]>; writes: Write[]; service: any; failNextWrite: (table: string, operation: "update" | "insert") => void; raceNextInsert: () => void }) => Promise<void>,
) {
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  const service = await import("../src/services/operations-report.service.js");
  const tables = structuredClone(seed);
  const writes: Write[] = [];
  let fail: { table: string; operation: "update" | "insert" } | null = null;
  let raceInsert = false;
  const originalFrom = supabaseAdmin.from;
  (supabaseAdmin as any).from = (table: string) => {
    let operation: "select" | "update" | "insert" = "select";
    let payload: Row = {};
    const filters: Array<[string, unknown]> = [];
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      update: (value: Row) => { operation = "update"; payload = value; return chain; },
      insert: (value: Row) => { operation = "insert"; payload = value; return chain; },
      maybeSingle: async () => execute(true),
      single: async () => execute(true),
    };
    const execute = (single: boolean) => {
      const rows = tables[table] ?? (tables[table] = []);
      const matching = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      if (operation !== "select") {
        writes.push({ table, operation, filters: [...filters], payload: { ...payload } });
        if (fail?.table === table && fail.operation === operation) {
          fail = null;
          return { data: null, error: { code: "XX000", message: "simulated database write failure" } };
        }
        if (operation === "insert") {
          if (raceInsert && table === "offload_items") {
            raceInsert = false;
            rows.push({ ...payload });
            return { data: null, error: { code: "23505", message: "concurrent duplicate id" } };
          }
          if (rows.some((row) => row.id === payload.id)) return { data: null, error: { code: "23505", message: "duplicate id" } };
          const inserted = { ...payload };
          rows.push(inserted);
          return { data: inserted, error: null };
        }
        if (!matching[0]) return { data: null, error: null };
        Object.assign(matching[0], payload);
        return { data: single ? matching[0] : matching, error: null };
      }
      return { data: single ? matching[0] ?? null : matching, error: null };
    };
    return chain;
  };
  try {
    await action({
      tables,
      writes,
      service,
      failNextWrite: (table, operation) => { fail = { table, operation }; },
      raceNextInsert: () => { raceInsert = true; },
    });
  } finally {
    (supabaseAdmin as any).from = originalFrom;
  }
  return { tables, writes, service };
}

function seedTables() {
  return {
    trips: [
      { id: tripId, trip_number: 1, dispatch_number: "D-1", status: "IN_PROGRESS" },
      { id: otherTripId, trip_number: 2, dispatch_number: "D-2", status: "IN_PROGRESS" },
    ],
    trip_stops: [
      { id: stopId, trip_id: tripId, stop_sequence: 1 },
      { id: otherStopId, trip_id: tripId, stop_sequence: 2 },
    ],
    offloads: [
      { id: offloadId, trip_id: tripId, trip_stop_id: stopId, reason: "Original", number_of_boxes: null, comments: null },
      { id: otherOffloadId, trip_id: tripId, trip_stop_id: stopId, reason: "Other", number_of_boxes: null, comments: null },
    ],
    trip_line_items: [
      { id: lineId, trip_id: tripId, trip_stop_id: stopId, dr_number: "DR-1", customer_model: "M-1", quantity: 2, cbm: 0.25 },
      { id: otherTripLineId, trip_id: otherTripId, trip_stop_id: null, dr_number: "DR-2", customer_model: "M-2", quantity: 3, cbm: 0.5 },
      { id: otherStopLineId, trip_id: tripId, trip_stop_id: otherStopId, dr_number: "DR-3", customer_model: "M-3", quantity: 4, cbm: 0.75 },
    ],
    offload_items: [],
    operations_report_conversions: [],
  };
}

function payload(overrides: Row = {}) {
  return {
    trip_id: tripId,
    trip_stop_id: stopId,
    item: { id: itemId, trip_line_item_id: lineId, quantity: 9 },
    ...overrides,
  };
}

test("updateOffload rejects a parent ID from another trip before any write", async () => {
  await withDatabase(seedTables(), async ({ service, writes }) => {
    // The report exists, but the supplied trip does not own that report ID.
    await assert.rejects(service.updateOffload(admin, offloadId, payload({ trip_id: otherTripId, trip_stop_id: null })), /Offload not found for this trip/);
    assert.deepEqual(writes, []);
  });
});

test("updateOffload rejects an item ID owned by a different Offload parent without writing", async () => {
  await withDatabase({ ...seedTables(), offload_items: [{ id: itemId, offload_id: otherOffloadId, trip_line_item_id: lineId, quantity: 1, total_cbm: 1 }] }, async ({ service, writes }) => {
    await assert.rejects(service.updateOffload(admin, offloadId, payload()), /does not belong to this report/);
    assert.deepEqual(writes, []);
  });
});

test("updateOffload retains the converted-source immutability guard", async () => {
  await withDatabase({
    ...seedTables(),
    operations_report_conversions: [{ id: "e23e4567-e89b-42d3-a456-426614174000", source_type: "OFFLOAD", source_id: offloadId }],
  }, async ({ service, writes }) => {
    await assert.rejects(service.updateOffload(admin, offloadId, payload()), /read-only/);
    assert.deepEqual(writes, []);
  });
});

test("updateOffload rejects a linked source line item from another trip or stop before writing", async () => {
  await withDatabase(seedTables(), async ({ service, writes }) => {
    await assert.rejects(service.updateOffload(admin, offloadId, payload({ item: { id: itemId, trip_line_item_id: otherTripLineId, quantity: 9 } })), /does not belong to this Offload trip/);
    assert.deepEqual(writes, []);
    await assert.rejects(service.updateOffload(admin, offloadId, payload({ item: { id: itemId, trip_line_item_id: otherStopLineId, quantity: 9 } })), /does not belong to this Offload stop/);
    assert.deepEqual(writes, []);
  });
});

test("updateOffload inserts an independently valued item without copying source trip values", async () => {
  await withDatabase(seedTables(), async ({ service, tables, writes }) => {
    const result = await service.updateOffload(admin, offloadId, payload());
    assert.equal(result.item.offload_id, offloadId);
    assert.equal(result.item.trip_line_item_id, lineId);
    assert.equal(result.item.quantity, 9);
    assert.equal(result.item.total_cbm, null, "omitted CBM remains independent rather than defaulting from the trip line item");
    assert.equal(tables.offload_items[0].quantity, 9);
    assert.equal(tables.offload_items[0].total_cbm, null);
    assert.equal(Object.hasOwn(tables.offload_items[0], "dr_number"), false, "the new report item does not copy trip-item display data");
    assert.equal(tables.offload_items.length, 1);
    assert.equal(tables.offload_items[0].offload_id, offloadId);
    assert.deepEqual(writes.map((write) => [write.table, write.operation]), [["offload_items", "insert"]]);
  });
});

test("updateOffload supports a standalone item when no source line item exists", async () => {
  await withDatabase(seedTables(), async ({ service, tables, writes }) => {
    const result = await service.updateOffload(admin, offloadId, payload({ item: { id: itemId, trip_line_item_id: null, total_cbm: 1.125 } }));
    assert.equal(result.item.offload_id, offloadId);
    assert.equal(result.item.trip_line_item_id, null);
    assert.equal(result.item.quantity, null);
    assert.equal(result.item.total_cbm, 1.125);
    assert.equal(tables.offload_items.length, 1);
    assert.deepEqual(writes.map((write) => [write.table, write.operation]), [["offload_items", "insert"]]);
  });
});

test("updateOffload updates only the selected child item and parent", async () => {
  const originalItems = [
    { id: itemId, offload_id: offloadId, trip_line_item_id: lineId, quantity: 2, total_cbm: 0.25 },
    { id: otherItemId, offload_id: otherOffloadId, trip_line_item_id: lineId, quantity: 5, total_cbm: 0.75 },
  ];
  await withDatabase({ ...seedTables(), offload_items: originalItems }, async ({ service, tables, writes }) => {
    await service.updateOffload(admin, offloadId, payload());
    assert.equal(tables.offload_items[0].quantity, 9);
    assert.equal(tables.offload_items[0].total_cbm, 0.25, "quantity updates do not modify Total CBM");
    assert.equal(tables.offload_items[1].quantity, 5, "another parent's item remains unchanged");
    assert.deepEqual(writes.map((write) => [write.table, write.operation, write.filters]), [
      ["offload_items", "update", [["id", itemId], ["offload_id", offloadId]]],
    ]);
  });
});

test("updateOffload reuses an existing report/source item when a retry has a different client ID", async () => {
  await withDatabase({ ...seedTables(), offload_items: [{ id: itemId, offload_id: offloadId, trip_line_item_id: lineId, quantity: 2, total_cbm: 0.25 }] }, async ({ service, tables, writes }) => {
    await service.updateOffload(admin, offloadId, payload({ item: { id: otherItemId, trip_line_item_id: lineId, quantity: 8 } }));
    assert.equal(tables.offload_items.length, 1, "a retry does not insert a second row for the same report/source link");
    assert.equal(tables.offload_items[0].id, itemId);
    assert.equal(tables.offload_items[0].quantity, 8);
    assert.deepEqual(writes.map((write) => [write.table, write.operation, write.filters]), [
      ["offload_items", "update", [["id", itemId], ["offload_id", offloadId]]],
    ]);
  });
});

test("updateOffload retries standalone items without creating another null-source row", async () => {
  await withDatabase({ ...seedTables(), offload_items: [{ id: itemId, offload_id: offloadId, trip_line_item_id: null, quantity: 2, total_cbm: null }] }, async ({ service, tables, writes }) => {
    await service.updateOffload(admin, offloadId, payload({ item: { id: otherItemId, trip_line_item_id: null, quantity: 8 } }));
    assert.equal(tables.offload_items.length, 1);
    assert.equal(tables.offload_items[0].id, itemId);
    assert.equal(tables.offload_items[0].quantity, 8);
    assert.deepEqual(writes.map((write) => [write.table, write.operation, write.filters]), [
      ["offload_items", "update", [["id", itemId], ["offload_id", offloadId]]],
    ]);
  });
});

test("updateOffload reports update and insert failures without changing stored items", async () => {
  await withDatabase({ ...seedTables(), offload_items: [{ id: itemId, offload_id: offloadId, trip_line_item_id: lineId, quantity: 2, total_cbm: 0.25 }] }, async ({ service, tables, failNextWrite }) => {
    failNextWrite("offload_items", "update");
    await assert.rejects(service.updateOffload(admin, offloadId, payload()), /Unable to update Offload item report data/);
    assert.equal(tables.offload_items[0].quantity, 2);
  });
  await withDatabase(seedTables(), async ({ service, tables, failNextWrite }) => {
    failNextWrite("offload_items", "insert");
    await assert.rejects(service.updateOffload(admin, offloadId, payload()), /Unable to create Offload item report data/);
    assert.equal(tables.offload_items.length, 0);
  });
});

test("updateOffload resolves an ambiguous duplicate-ID insert by updating the matching scoped row", async () => {
  await withDatabase(seedTables(), async ({ service, tables, writes, raceNextInsert }) => {
    raceNextInsert();
    const result = await service.updateOffload(admin, offloadId, payload());
    assert.equal(result.item.id, itemId);
    assert.equal(result.item.offload_id, offloadId);
    assert.equal(tables.offload_items.length, 1, "the concurrent retry leaves one child item");
    assert.equal(tables.offload_items[0].quantity, 9);
    assert.deepEqual(writes.map((write) => [write.table, write.operation]), [
      ["offload_items", "insert"], ["offload_items", "update"],
    ]);
  });
});
