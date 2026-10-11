import test from "node:test";
import assert from "node:assert/strict";
import { sha256SessionIdentifier } from "../src/utils/session-rules.js";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test";
process.env.SUPABASE_ANON_KEY = "isolated-test";
test("website API enforces admin writes, CRUD revisions and public response shape", async () => {
  const { supabaseAdmin, supabaseAuth } =
    await import("../src/config/supabase.js");
  const { default: app } = await import("../src/app.js");
  const records: any[] = [];
  let role = "ADMIN",
    count = 0;
  const appSessionId = "a".repeat(43);
  const appSessionHash = sha256SessionIdentifier(appSessionId);
  const originalFrom = supabaseAdmin.from,
    originalAuth = supabaseAuth.auth.getUser;
  (supabaseAuth.auth as any).getUser = async () => ({
    data: { user: { id: "test-admin" } },
    error: null,
  });
  (supabaseAdmin as any).from = (name: string) => {
    if (name === "profiles")
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { role, is_admin: role === "ADMIN" },
              error: null,
            }),
          }),
        }),
      };
    if (name === "admin_staff_session_days") {
      let requestedHash: string | undefined;
      const sessionQuery: any = {
        select: () => sessionQuery,
        eq: (column: string, value: string) => {
          assert.equal(column, "session_hash");
          requestedHash = value;
          return sessionQuery;
        },
        maybeSingle: async () => ({
          data: requestedHash === appSessionHash
            ? {
                profile_id: "test-admin",
                role,
                expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              }
            : null,
          error: null,
        }),
      };
      return sessionQuery;
    }
    assert.equal(name, "website_content");
    let op = "select",
      payload: any,
      filters: Record<string, any> = {};
    const execute = () => {
      const matches = records.filter((r) =>
        Object.entries(filters).every(([k, v]) => r[k] === v),
      );
      if (op === "insert") {
        const row = { id: `record-${++count}`, revision: 1, ...payload };
        records.push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        if (!matches.length) return { data: null, error: null };
        Object.assign(matches[0], payload);
        return { data: matches[0], error: null };
      }
      if (op === "delete") {
        for (const row of matches) records.splice(records.indexOf(row), 1);
        return { data: matches.map((r) => ({ id: r.id })), error: null };
      }
      return { data: matches, error: null };
    };
    const chain: any = {
      select: () => chain,
      eq: (k: string, v: any) => {
        filters[k] = v;
        return chain;
      },
      order: async () => execute(),
      single: async () => execute(),
      maybeSingle: async () => { const result = execute(); return {...result, data: Array.isArray(result.data) ? result.data[0] || null : result.data}; },
      insert: (v: any) => {
        op = "insert";
        payload = v;
        return chain;
      },
      update: (v: any) => {
        op = "update";
        payload = v;
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve(execute()).then(resolve, reject),
    };
    return chain;
  };
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const call = (path: string, method = "GET", body?: any, auth = true) =>
    fetch(`http://127.0.0.1:${port}/api/website${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth
          ? {
              Authorization: "Bearer test",
              "X-App-Session": appSessionId,
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const record = {
      title: "Delivery update",
      content: "New announcement",
      date: "2026-09-27",
    };
    assert.equal(
      (await call("/announcements", "POST", record, false)).status,
      401,
    );
    role = "STAFF";
    assert.equal((await call("/announcements", "POST", record)).status, 403);
    role = "ADMIN";
    assert.equal(
      (await call("/announcements", "POST", { ...record, title: "" })).status,
      400,
    );
    const createdResponse = await call("/announcements", "POST", record);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created._revision, 1);
    const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila", year:"numeric", month:"2-digit", day:"2-digit"}).format(new Date());
    assert.equal(created.date, today);
    const publicList = await (
      await call("/announcements", "GET", undefined, false)
    ).json();
    assert.equal(publicList[0].title, record.title);
    const updated = await call(`/announcements/${created.id}`, "PUT", {
      ...record,
      title: "Updated",
      _revision: 1,
    });
    assert.equal(updated.status, 200);
    const edited = await updated.json();
    assert.equal(edited._revision, 2);
    assert.equal(edited.date, today);
    assert.equal(
      (
        await call(`/announcements/${created.id}`, "PUT", {
          ...record,
          _revision: 1,
        })
      ).status,
      409,
    );
    assert.equal(
      (await call(`/announcements/${created.id}?revision=1`, "DELETE")).status,
      409,
    );
    assert.equal((await call("/manage/announcements", "GET", undefined, false)).status, 401);
    role = "STAFF";
    assert.equal((await call("/manage/announcements")).status, 403);
    role = "ADMIN";
    const archived = await call(`/announcements/${created.id}`, "PUT", { ...record, status:"archived", _revision:2 });
    assert.equal(archived.status, 200);
    assert.deepEqual(await (await call("/announcements", "GET", undefined, false)).json(), []);
    const history = await (await call("/manage/announcements")).json();
    assert.equal(history[0].status, "archived");
    assert.equal(history[0]._revision, 3);
    assert.equal((await call(`/announcements/${created.id}`, "PUT", { ...record, status:"published", _revision:2 })).status, 409);
    assert.equal((await call(`/announcements/${created.id}`, "PUT", { ...record, status:"published", _revision:3 })).status, 200);
    assert.equal((await (await call("/announcements")).json()).length, 1);
    assert.equal(
      (await call(`/announcements/${created.id}?revision=4`, "DELETE")).status,
      200,
    );
    assert.deepEqual(await (await call("/announcements")).json(), []);
    const truck = {truckType:"10W", images:[{url:"https://example.com/truck.jpg"}], commonCargos:[], maxLoad:"20 tonnes", dimensions:"32 ft", status:"archived"};
    const savedTruck = await (await call("/trucks", "POST", truck)).json();
    assert.deepEqual(await (await call("/trucks")).json(), []);
    assert.equal((await (await call("/manage/trucks")).json())[0].status, "archived");
    assert.equal((await call(`/trucks/${savedTruck.id}`, "PUT", {...truck, status:"published", _revision:1})).status,200);
    assert.equal((await (await call("/trucks")).json()).length,1);
    const job = {title:"Truck driver", content:"Delivery responsibilities", qualifications:"Valid professional license", imageUrl:"https://example.com/ignored.jpg"};
    assert.equal((await call("/careers","POST",job,false)).status,401);
    const jobResponse = await call("/careers","POST",job);
    assert.equal(jobResponse.status,201);
    const savedJob = await jobResponse.json();
    assert.equal(savedJob.date,today);
    assert.equal(savedJob.qualifications,job.qualifications);
    assert.equal(savedJob.imageUrl,undefined);
    assert.equal((await (await call("/careers")).json()).length,1);
    assert.equal((await call(`/careers/${savedJob.id}`,"PUT",{...savedJob,status:"archived"})).status,200);
    assert.deepEqual(await (await call("/careers")).json(),[]);
    assert.equal((await (await call("/manage/careers")).json())[0].title,job.title);
    assert.equal((await call(`/careers/${savedJob.id}`,"PUT",{...savedJob,status:"published",_revision:2})).status,200);
    assert.equal((await (await call("/careers")).json()).length,1);
    assert.equal((await call("/not-a-collection")).status, 400);
    assert.equal((await call("/media", "POST", {}, false)).status, 401);
  } finally {
    server.close();
    supabaseAdmin.from = originalFrom;
    supabaseAuth.auth.getUser = originalAuth;
  }
});
