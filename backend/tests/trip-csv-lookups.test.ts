import assert from "node:assert/strict";
import test from "node:test";
import { resolveTripCsvLookups } from "../../frontend/src/components/admin/tripCsvLookups.js";
import { readTripCsv } from "../../frontend/src/components/admin/tripCsv.js";

const empty = () => ({ products: [], stores: [], trucks: [], warehouses: [], "trip-types": [] });

test("reuses local matches and searches repeated missing values only once", async () => {
  const [group] = readTripCsv("Ship To,Customer Model,Qty\nSTORE,MODEL-1,1\nstore,model-1,2\nSTORE,MODEL-1,3");
  const calls: string[] = [];
  const result = await resolveTripCsvLookups(group!, { ...empty(), stores: [{ id: "store", label: "STORE" }] }, async (kind, query) => {
    calls.push(`${kind}:${query}`);
    return [{ id: "product", label: "Product name", values: { model_code: "MODEL-1" } }];
  });
  assert.deepEqual(calls.map(value => value.toLowerCase()), ["products:model-1"]);
  assert.equal(result.find("products", " MODEL-1 ")?.id, "product");
  assert.equal(result.find("stores", "store")?.id, "store");
});

test("resolves independent records in parallel with at most six requests in flight", async () => {
  const [group] = readTripCsv("Customer Model,Qty\n" + Array.from({ length: 20 }, (_, i) => `MODEL-${i},1`).join("\n"));
  let inFlight = 0, maxInFlight = 0, calls = 0;
  const progress: number[] = [];
  const result = await resolveTripCsvLookups(group!, empty(), async (_, query) => {
    calls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 10));
    inFlight--;
    return [{ id: query, label: query }];
  }, (completed, total) => { assert.equal(total, 20); progress.push(completed); });
  assert.equal(calls, 20);
  assert.equal(maxInFlight, 6);
  assert.equal(result.lookups.products.length, 20);
  assert.equal(result.find("products", "MODEL-19")?.id, "MODEL-19");
  assert.deepEqual(progress, Array.from({ length: 21 }, (_, i) => i));
});

test("does not choose ambiguous matches or mutate the initial options", async () => {
  const [group] = readTripCsv("Customer Model,Qty\nMODEL,1");
  const current = empty();
  const result = await resolveTripCsvLookups(group!, current, async () => [{ id: "a", label: "MODEL" }, { id: "b", label: "MODEL" }]);
  assert.equal(result.find("products", "MODEL"), undefined);
  assert.deepEqual(current.products, []);
  await assert.rejects(resolveTripCsvLookups(group!, current, async () => { throw new Error("Lookup unavailable"); }), /Lookup unavailable/);
});

test("resolves repeated store names within the imported customer", async () => {
  const [group] = readTripCsv("Customer,Ship To,Qty\nCLIENT,BRANCH,1\nCLIENT,BRANCH,2");
  const calls: string[] = [];
  const result = await resolveTripCsvLookups(group!, {
    ...empty(), stores: [{ id: "other-store", label: "BRANCH", values: { customer_id: "other" } }],
  }, async (kind, query, customerId) => {
    calls.push(`${kind}:${query}:${customerId ?? ""}`);
    return kind === "customers"
      ? [{ id: "client", label: "CLIENT" }]
      : [{ id: "correct-store", label: "BRANCH", values: { customer_id: "client" } }];
  });
  assert.deepEqual(calls, ["customers:CLIENT:", "stores:BRANCH:client"]);
  assert.equal(result.find("stores", "BRANCH", "client")?.id, "correct-store");
  assert.equal(result.find("customers", "CLIENT")?.id, "client");
});
