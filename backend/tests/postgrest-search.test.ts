import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/utils/api-response.js";
import { buildIlikeOrFilter } from "../src/utils/postgrest-search.js";

test("builds the same OR structure for ordinary literal searches", () => {
  assert.equal(
    buildIlikeOrFilter(["first_name", "last_name"], "  Jane Doe  "),
    'first_name.ilike."%Jane Doe%",last_name.ilike."%Jane Doe%"',
  );
});

test("quotes PostgREST grammar characters and escapes LIKE wildcards", () => {
  const filter = buildIlikeOrFilter(
    ["name", "code"],
    'ACME, (West). "Dock" \\ 50%_done:',
  );

  assert.equal(
    filter,
    'name.ilike."%ACME, (West). \\"Dock\\" \\\\\\\\ 50\\\\%\\\\_done:%",code.ilike."%ACME, (West). \\"Dock\\" \\\\\\\\ 50\\\\%\\\\_done:%"',
  );
  assert.equal((filter!.match(/\.ilike\./g) ?? []).length, 2);
  assert.equal((filter!.match(/,code\.ilike\./g) ?? []).length, 1);
});

test("ignores empty search and enforces bounded search length", () => {
  assert.equal(buildIlikeOrFilter(["name"], "  "), undefined);
  assert.throws(
    () => buildIlikeOrFilter(["name"], "x".repeat(101)),
    (error: unknown) => error instanceof ApiError && error.statusCode === 400,
  );
});

test("rejects PostgREST's star LIKE wildcard rather than broadening a search", () => {
  assert.throws(
    () => buildIlikeOrFilter(["name"], "literal*text"),
    (error: unknown) =>
      error instanceof ApiError && error.code === "INVALID_SEARCH_CHARACTER",
  );
});
