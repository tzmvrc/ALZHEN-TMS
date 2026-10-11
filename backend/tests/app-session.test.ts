import assert from "node:assert/strict";
import test from "node:test";
import {
  assertActiveTruckerSession,
  createTruckerSession,
  removeCurrentTruckerSession,
  AppSessionError,
} from "../src/services/app-session.service.js";
import {
  nextManilaMidnight,
  sessionHashesMatch,
  sha256SessionIdentifier,
} from "../src/utils/session-rules.js";

function makeSessionStore() {
  const rows = new Map<string, { profile_id: string; session_hash: string }>();
  const db = {
    from: () => ({
      upsert: async (row: { profile_id: string; session_hash: string }) => {
        rows.set(row.profile_id, row);
        return { error: null };
      },
      select: () => {
        const filters: Record<string, string> = {};
        const query = {
          eq(key: string, value: string) {
            filters[key] = value;
            return query;
          },
          maybeSingle: async () => ({ data: rows.get(filters.profile_id), error: null }),
        };
        return query;
      },
      delete: () => {
        const filters: Record<string, string> = {};
        const query = {
          eq(key: string, value: string) {
            filters[key] = value;
            return query;
          },
          then(resolve: (result: { error: null }) => unknown) {
            const row = rows.get(filters.profile_id);
            if (row?.session_hash === filters.session_hash) rows.delete(filters.profile_id);
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return query;
      },
    }),
  } as never;
  return { db, rows };
}

test("ADMIN and STAFF cutoff is the next Manila midnight, including exact midnight", () => {
  const before = nextManilaMidnight(new Date("2026-10-12T15:59:00.000Z"));
  assert.equal(before.toISOString(), "2026-10-12T16:00:00.000Z");

  const atCutoff = nextManilaMidnight(new Date("2026-10-12T16:00:00.000Z"));
  assert.equal(atCutoff.toISOString(), "2026-10-13T16:00:00.000Z");
});

test("session hashes are stable and stale trucker identifiers are rejected after replacement", async () => {
  const { db, rows } = makeSessionStore();
  const firstSession = await createTruckerSession("profile-1", db);
  await assertActiveTruckerSession("profile-1", firstSession, db);

  const replacement = await createTruckerSession("profile-1", db);
  assert.notEqual(firstSession, replacement);
  await assert.rejects(
    assertActiveTruckerSession("profile-1", firstSession, db),
    (error: unknown) => error instanceof AppSessionError && error.code === "TRUCKER_SESSION_REPLACED",
  );
  await assertActiveTruckerSession("profile-1", replacement, db);
  assert.equal(rows.get("profile-1")?.session_hash, sha256SessionIdentifier(replacement));
  assert.equal(sessionHashesMatch(sha256SessionIdentifier(firstSession), sha256SessionIdentifier(replacement)), false);
});

test("trucker logout only deletes the matching active identifier", async () => {
  const { db, rows } = makeSessionStore();
  const oldSession = await createTruckerSession("profile-2", db);
  const currentSession = await createTruckerSession("profile-2", db);

  await removeCurrentTruckerSession("profile-2", oldSession, db);
  assert.equal(rows.has("profile-2"), true);
  await removeCurrentTruckerSession("profile-2", currentSession, db);
  assert.equal(rows.has("profile-2"), false);
});

