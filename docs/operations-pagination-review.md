# Operations pagination — approval package

## Approved migration (applied October 17, 2026)

- File: `backend/migrations/2026_10_29_proposed_operations_pagination.sql`
- SHA-256: `DF1E2E00532866F440A710440492F808DBD04F64E66CF1EC7395C46B843ABC84`
- New objects: `public.v_operations_report_page` and pure, immutable
  `public.operations_natural_sort_v1(text)`.
- Purpose: database-level search, classification filtering, numeric-aware text
  sorting and stable page identities across all four physical report tables.
  Existing report views cannot provide this unified page contract.

## Data and security impact

No business rows are inserted, backfilled, changed, deleted or restored. No
existing views, tables, indexes, policies, publications or base grants change.
The migration grants SELECT on the new view and EXECUTE on its helper only to
service_role, revoking PUBLIC/anon/authenticated access to those new objects.
It does not expose receipts, Storage paths, profile emails or credentials.
The backend page endpoint requires authenticated ADMIN/STAFF; TRUCKER keeps its
existing assignment-restricted endpoint.

The projection reads Trips, exact stops, line items, report items, conversion
identities, active primary assignments and minimal name/route lookups. Zero or
multiple active PRIMARY assignments retain reports with no arbitrary vehicle
choice. Each result remains `(source_type, source_record_id)`; classification
does not change its physical identity. Converted sources remain excluded.
Historical archive visibility is unchanged. Existing DR-based creation and
permanent deletion/cleanup paths are unchanged.

## Compatibility and rollout

`GET /reports/operations/page` selects only the requested range and one exact
count, then hydrates only the selected reports and their related trip context.
Page sizes are limited to 100. The UI search and type filter query the whole
authorized dataset; ordering ends with physical source type and ID. Text sort
uses token arrays to retain numeric-aware identifiers (DSP-2 before DSP-10),
with database collation for text tokens and NULLS LAST. It does not promise an
identical linguistic ordering to every browser's locale.

Supabase confirmed migration `20261017011210` (`operations_pagination`) after
the exact approved hash, project `hdmknewarynwpbrhfgai`, absent-object and schema
preflights. The frontend now defaults to the page API. Explicit
`VITE_OPERATIONS_PAGINATION=false` is the compatibility rollback switch.
Read-only SQL and the actual backend service verified bounded pages and counts. No deployment or operational test writes are
authorized by this package. Existing overview consumers remain compatible.
With paging enabled, a missing view returns an explicit configuration error;
it never silently falls back to an unbounded overview.

Preload and navigation use the same token/query-scoped API cache. Selection is
page-scoped, cleared when page membership/query changes, and unavailable during
pending navigation. Active editors defer page changes and Realtime refresh.
Deleting the last record corrects the requested page to the new last page.
Operations has no existing Excel export action to replace; Tracker and standard
report export paths remain unchanged. A future Operations export must use a
separate bounded workflow.

## Recovery

Disable `VITE_OPERATIONS_PAGINATION` first; the existing overview/API remains.
After checking dependent objects, the additive database objects can be removed:

```sql
BEGIN;
DROP VIEW public.v_operations_report_page;
DROP FUNCTION public.operations_natural_sort_v1(text);
COMMIT;
```

This recovery SQL is documentation only and also requires approval before live
execution. Existing report definitions/data need no restoration. The proposal
is transactional and uses a 3-second lock timeout; rerunning CREATE against
existing objects deliberately fails instead of replacing them silently.

## Evidence and limits

- Live read-only preflight: page view absent; all sixteen queried source/lookup
  tables have service_role SELECT; existing shared-design RLS remains enabled.
- Disposable PostgreSQL 18: proposal compiled and committed in a new fixture DB;
  78 physical reports (75 Offloads), cross-page search/filter/count, distinct
  identity, duplicate PRIMARY assignments, zero values, correct DR stop ownership,
  converted-source exclusion, natural sort, browser-role denial and service-role
  view access passed. All fixture mutations were isolated from production.
- EXPLAIN ANALYZE fixture search execution: 3.844ms on this small dataset. This
  is not a production benchmark or justification for new indexes.
- Backend tests verify bounded range/count, allowlists, exact hydration of 25
  selected records, role rejection and no overview fallback on a missing view.
- Actual-screen browser fixture: 102 records, search beyond page 1, empty result,
  type filters, both sort directions, page-scoped selection, cached back-navigation
  (zero additional requests), last-page deletion, Realtime and active-draft gating.
  Thirteen page reads across the full scenario; no production writes.
- Page selection/count and hydration are separate reads: concurrent changes can
  transiently shorten a page until refresh. No sibling/source replacement is used.
  Live production query plans, large-volume cost and authenticated two-account
  page reads are still unverified. Both controlled live tabs currently show Login.

Approval must explicitly identify this exact file/hash. Earlier Tracker,
collaboration, deletion and shared-design approvals do not cover this proposal.


## Activation evidence (October 17, 2026)

- Approved SQL bytes/hash unchanged. Supabase migration success and migration
  history verified; no prior migration repeated or business records modified.
- Live projection: 11 records, 11 distinct physical identities (5 Loading,
  6 Unloading). Page size 5 returned 5 rows with total 11 via PostgREST.
- Actual backend service against live data: pages 1 and 2 returned 5 each,
  total 11 / 3 pages. Offload filter and unmatched search returned true empty
  results, total 0. This bypassed HTTP authentication for a read-only service
  check; it is not authenticated browser evidence. No identifiers printed.
- service_role SELECT/EXECUTE verified; authenticated and anon view SELECT
  denied; authenticated helper EXECUTE denied. No new base grants or RLS changes.
- Disposable PostgreSQL fixture expanded to 128 reports (125 Offloads), including
  final offset 125 returning 3 rows, source uniqueness, cross-page search,
  classifications, natural sort, conversion exclusion and service-only access.
  Fixture EXPLAIN search execution 5.470ms; not a production benchmark.
- Browser fixture now consumes the real default-enabled feature flag (no
  forced flag override). 102 fixture records, 13 reads, 0 cached-return reads,
  cross-page search/filter/sort, last-page correction and draft-safe Realtime pass.
- Production volume above 100 was NOT fabricated. Large-volume evidence is from
  disposable database and isolated browser fixtures. Real signed-in acceptance
  remains pending; both controlled application tabs currently show Login.
