import test from "node:test";
import assert from "node:assert/strict";
import { readSharedWidths, refreshSharedWidths, saveSharedWidth, retrySharedWidths, clearSharedWidths } from "../src/services/shared-table-widths";

test("logout clears pending layout state and prevents a late read from repopulating a new session", async () => {
  const original = globalThis.fetch; let release!: () => void;
  globalThis.fetch = async () => { await new Promise<void>((done) => { release = done; }); return new Response(JSON.stringify({ success: true, data: [{ column_key: "route", width_px: 999, revision: 1 }] })); };
  try {
    const pending = refreshSharedWidths("logged-out-width-session", "trips");
    clearSharedWidths(); release(); await pending;
    assert.equal(readSharedWidths("logged-out-width-session", "trips").loaded, false);
    assert.equal(readSharedWidths("another-width-session", "trips").widths.route, undefined);
  } finally { globalThis.fetch = original; clearSharedWidths(); }
});
test("shared widths persist independently of session/device, retain failures and target one column", async () => {
  const original = globalThis.fetch;
  const rows = new Map<string, { column_key: string; width_px: number; revision: number }>();
  const writes: Array<{ path: string; body: { width_px: number; expected_revision: number } }> = [];
  let fail = false;
  globalThis.fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (options?.method === "PATCH") {
      const body = JSON.parse(String(options.body)); writes.push({ path, body });
      if (fail) return new Response(JSON.stringify({ message: "Save failed" }), { status: 503 });
      const key = decodeURIComponent(path.split("/").pop()!);
      const current = rows.get(key);
      if ((current?.revision ?? 0) !== body.expected_revision) return new Response(JSON.stringify({ message: "Conflict" }), { status: 409 });
      const row = { column_key: key, width_px: body.width_px, revision: body.expected_revision + 1 }; rows.set(key, row);
      return new Response(JSON.stringify({ success: true, data: row }));
    }
    return new Response(JSON.stringify({ success: true, data: [...rows.values()] }));
  };
  try {
    await saveSharedWidth("width-session-a", "trips", "route", 420);
    assert.equal(writes.length, 1);
    await saveSharedWidth("width-session-a", "trips", "route", 420);
    assert.equal(writes.length, 1, "unchanged widths skip writes");
    await refreshSharedWidths("width-session-b", "trips");
    assert.equal(readSharedWidths("width-session-b", "trips").widths.route, 420, "another session loads the same stored width");
    fail = true;
    await saveSharedWidth("width-session-a", "trips", "route", 510);
    assert.equal(readSharedWidths("width-session-a", "trips").widths.route, 510);
    assert.match(readSharedWidths("width-session-a", "trips").error, /unsaved/);
    fail = false; await retrySharedWidths("width-session-a", "trips");
    assert.equal(rows.get("route")?.width_px, 510);
    assert.equal(readSharedWidths("width-session-a", "trips").error, "");
    assert.ok(writes.every((write) => write.path === "/api/table-layouts/trips/route"));
    assert.equal(rows.size, 1);
  } finally { globalThis.fetch = original; }
});

test("a late layout poll cannot replace a newer acknowledged width", async () => {
  const original = globalThis.fetch;
  let gets = 0;
  let releaseWrite!: (response: Response) => void;
  let releaseOldRead!: (response: Response) => void;
  let started!: () => void;
  const patchStarted = new Promise<void>((resolve) => { started = resolve; });
  const response = (width: number, revision: number, list: boolean) => new Response(JSON.stringify({ success: true, data: list ? [{ column_key: "route", width_px: width, revision }] : { column_key: "route", width_px: width, revision } }));
  globalThis.fetch = async (_input, options) => {
    if (options?.method === "PATCH") { started(); return new Promise<Response>((resolve) => { releaseWrite = resolve; }); }
    gets += 1;
    if (gets === 3) return new Promise<Response>((resolve) => { releaseOldRead = resolve; });
    return response(180, 1, true);
  };
  try {
    await refreshSharedWidths("stale-width-session", "trips");
    const write = saveSharedWidth("stale-width-session", "trips", "route", 450);
    await patchStarted;
    const staleRead = refreshSharedWidths("stale-width-session", "trips", true);
    releaseWrite(response(450, 2, false));
    await write;
    releaseOldRead(response(180, 1, true));
    await staleRead;
    assert.equal(readSharedWidths("stale-width-session", "trips").widths.route, 450);
  } finally { globalThis.fetch = original; }
});
