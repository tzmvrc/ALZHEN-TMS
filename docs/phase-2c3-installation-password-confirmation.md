# Phase 2C.3 — approved migrations and password-confirmed bulk deletion

October 18, 2026. **Installed and locally tested; live whole-trip deletion disabled.**

## Authorization and backup waiver

The user explicitly accepted proceeding without a verified database backup and
waived that installation prerequisite. No recovery timestamp/restore point is
claimed, and no production export was created. This waiver does not authorize
deletion, destructive production acceptance or feature activation.

MCP scope and backend SUPABASE_URL both match `hdmknewarynwpbrhfgai`. Dirty staged,
unstaged and untracked work was preserved; no unresolved Git index entries.

## Applied exact files, in approved order

All paths below are under `backend/migrations/`. Disk hashes verified before and
after installation; no SQL file was modified or corrective SQL applied.

| File | SHA-256 | Supabase version / name |
|---|---|---|
| `2026_11_06_proposed_operations_creator_attribution.sql` | `FD644E23536967C313DD8E1FCAE319B50C7606D811E66C27D39597B96AD5F8CC` | `20261018065149 operations_creator_attribution` |
| `2026_11_08_proposed_driver_update_parent.sql` | `9DCB55827F469F6E173239E189F814222291B7718B612252EEBF6C84AFAE3D09` | `20261018065157 driver_update_parent_compatible_cleanup` |
| `2026_11_07_proposed_whole_trip_deletion.sql` | `5790AA11C3D64E7888C1DA4F48BE7F1C8736C9DFAA84612F887843DD788CDE76` | `20261018065228 whole_trip_deletion` |

Each MCP application succeeded and was read-only verified before the next. All
three history entries occur once. Pre-existing history ended at planned_routes.

## Post-installation evidence

- Creator view retains all28 columns/order/types and ACL. Exact definition differs
  only in creator/submitter precedence; search/natural-sort projections preserved.
- Driver FK is exact trip_id -> trips.id, RESTRICT, NOT VALID, non-deferrable.
  Compatible existing transaction RPC normalized MD5:
  `91fd1eaf57d95d3f646b58d5d2d4bdd6`; owner postgres, original ADMIN/STAFF guard,
  signature, service-only ACL and `pg_catalog, public` search path retained.
- New signatures: preview_whole_trip_deletion_v1(uuid[],uuid) and
  delete_whole_trips_v1(uuid[],uuid). Both postgres-owned SECURITY DEFINER,
  search_path=pg_catalog, Admin guards, owner/service_role EXECUTE only; PUBLIC,
  anon/authenticated cannot execute. Their normalized body MD5s match exact disk
  SQL: preview `ad699f3a5759073e1dc85b9af5cd1ecf`, delete
  `35abed0f197268e13b5a360612c3866f`.
- Counts/content hashes match before/after across22 operational tables, including
  7trips,8stops,9line-items,7assignments,46driver-updates,9images,1POD,2review-events,
  existing loading/unloading, financial/operational/history/tracking/cache tables.
  No deletion jobs created; driver orphans0 and attachment-bearing updates8.
- Existing table/view ACL+RLS, policies, non-internal triggers and publication
  digests unchanged. Existing receipt bucket private. No broad browser/GPS grants.
- Actual service-role PostgREST call through wholeTripImpact returns all28 count
  fields and **can_delete=false**, blocked by activation. Only the STABLE read-only
  preview was invoked, never a live deletion RPC.
- First fingerprint verification used raw rather than normalized MD5 and hit the
  reviewed Windows CRLF/LF difference. Correct read-only normalization matched;
  other comparisons passed. No SQL repair or modified migration was used.

## Unified bulk selection and confirmation

Combined and Tracker use the same physical parent-ID resolver, dialog, API client,
Admin-only endpoint/service, atomic RPC, audit and durable exact-Storage cleanup.
Rows may share a trip; selected row and unique parent counts are separate. No
identity inferred from indexes, DR/dispatch labels or POD IDs.

Select-all targets **current page only**. Individual checks/unchecks, Clear and
inline scope/counts are supported. Page/filter changes clear selections. The
approved RPC caps batches at20 unique trips; larger selections show the real count
and limit and cannot confirm. They are never silently truncated or split.

Confirmation includes dispatch/IDs, row/trip counts, stops/dependencies, blockers,
irreversible cross-report warning and password. Button requires valid impact and
password. Duplicate clicks blocked synchronously. Failure retains records; retry
requires re-entry. Confirmed success clears selection/closes dialog and shows the
deleted-trip count. Pending Storage produces a warning, not false full completion.
Combined resets page1; Tracker clamps an emptied final page. Shared affected cache
prefix invalidation and existing secure Socket.IO/Supabase reconciliation reused;
no new subscriptions/publications and no unrelated Users-cache invalidation.

## Password verification and session safety

POST /trips/whole-delete carries trip_ids + current_password. No separate verify
endpoint, reusable authorization token or client passwordVerified flag is trusted.

1. Existing middleware validates original bearer, application session and role.
2. Service validates/copies/deduplicates/freezes parent IDs and Admin identity.
3. Feature gate checked before Auth and again immediately before SQL.
4. Email comes from auth.getUser(originalBearer), not client identity. A **new
   request-local Supabase Auth client** calls signInWithPassword, with persistence,
   refresh and URL session detection off and8s fetch limits. Returned user must
   match the original Admin. Only this temporary session is revoked with explicit
   signOut({scope:'local'}); no shared login client or app-session registration.
   Cleanup failure blocks deletion. Original access/refresh tokens never replaced.
5. Original bearer, application session and current DB Admin role rechecked after
   Auth. SQL independently rechecks Admin and blockers atomically. Captured batch
   cannot change while password verification awaits. No Auth token returned.
6. Password removed from request body before awaited work; never SQL arguments,
   audit, Socket.IO, URLs, logs or persistent browser state. UI clears on submit,
   success/failure/cancel; account/batch changes remount the confirmation. Temporary
   references cleared/dropped; JavaScript cannot guarantee string memory erasure
   or control the user's browser password manager.

Official supported APIs:
[password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword),
[local sign-out](https://supabase.com/docs/reference/javascript/auth-signout).

Rate protection: five confirmation attempts per Admin per15minutes, including wrong
passwords/successes; missing-password requests never reach Auth. Same-Admin overlap
rejected. Existing SOCKET_REDIS_URL enables atomic shared counters/compare-token
leases; outage fails closed. Without Redis, bounded process-local counters support
one instance; WEB_CONCURRENCY>1 fails closed. Independent hosts must also configure
shared Redis even with one worker each. Private120s concurrency leases confer no
deletion authority. Provider Auth limits remain additional protection.

## Final verification

- Backend **178/178**, frontend **87/87**, zero failed/skipped/cancelled.
- Backend/frontend TypeScript and production builds pass; PDF worker included.
  Existing Vite large-chunk warnings remain.
- New deletion/dialog/context/test lint clean. Expanded touched-file lint has
  **3 pre-existing errors**: Tracker no-control-regex and set-state-in-effect;
  Toast's existing useToast export violates only-export-components. No new lint
  failure remains. No backend ESLint configuration; TypeScript checks apply.
- Nine isolated browser fixtures pass: password, shared confirmation, Combined
  wizard, Tracker bulk/page scope, Tracker pagination, transaction deletion,
  retained reports, Operations actions and two-context draft-safe Realtime.
- Mocked Auth + actual local Express/SDK protocol tests cover missing/wrong/correct
  password, identity/role changes, expiry, STAFF/TRUCKER denial, local session
  cleanup/failure, attempts/rates, immutable batch binding and disabled feature.
  Browser tests verify clears after failure/cancel/account switch/network errors,
  no Storage persistence, one double-click request, acknowledgement-before-toast.
- Fresh disposable PG18 repeats the original regression,15 last-stop cases,
  operational/financial/history/attachment atomic rollback suite,3 synchronized
  writer/deleter races and two concurrent whole-trip callers. All pass; owned
  cluster stopped. Redis multi-replica budget uses a mocked shared protocol, not a
  live Redis cluster. Not every production ledger/trigger is modeled.
- Live checks were schema/hash/permissions and read-only service-role preview.
  No live password authentication, deletion, Storage cleanup or destructive
  authenticated acceptance claimed. Initial fixture/default-argument/session-stub/
  Vite-context and new lint issues were corrected; final listed runs pass.
- Git whitespace checks pass; existing CRLF conversion notices remain.

## Files changed

Backend: config/supabase.ts; routes/trip.routes.ts; whole-trip-deletion.service.ts;
new deletion-password.service.ts / deletion-confirmation-limit.ts; existing
whole-trip tests and new deletion-password / whole-trip-password-http tests.

Frontend: whole-trip service/dialog; ReportDataView and Tracker; shared Toast
context extraction + new toast-context.ts; unit tests; dialog/Combined/Tracker
browser fixtures + new whole-trip-password.browser.js. Documentation: this report
and main overhaul checkpoint. No unrelated source/approved SQL files overwritten.

## Remaining gates and recovery

Flags unchanged: whole-trip-delete unset/defaultfalse, tracking=false, planned
unset/defaultfalse, PDF=false, PODreview=true. Separate approval required for
activation and designated write acceptance records, excluding DR333. Before then,
verify approved-account password/session behavior, HTTPS outside local development,
shared Redis for replicas, cleanup/retention monitoring and accepted recovery risk.
Eight unresolved driver POD attachment references remain protected.

Rollback switch: WHOLE_TRIP_DELETE_ENABLED=false plus restart. Schema rollback
requires separate approval: remove new whole-trip functions, restore captured
original transaction RPC and drop its new FK **together transactionally**, restore
the prior creator view if required, retain cleanup jobs. Never combine the original
last-stop RPC with the restrictive FK. Schema rollback cannot restore files after
a future committed deletion. A backup waiver is not a recovery mechanism.

## Safety

Only three approved migrations applied. No live trip/operational removal, Storage
deletion, production destructive test, feature activation, unrelated database
change, GPS, Mapbox/Gemini request, deployment, commit or push. DR333 untouched.
Stop pending separate activation authorization.
