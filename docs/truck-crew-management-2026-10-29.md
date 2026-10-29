# Truck Crew Management — 2026-10-29

Implemented Driver/Helper classification, assignment-scoped crew, shared delivery dashboards, existing collaboration updates, and permanent actor attribution. Authentication roles remain ADMIN / STAFF / TRUCKER. No application commit, push or deployment was performed.

## Applied database migrations

Confirmed target project: `hdmknewarynwpbrhfgai`.

1. `truck_crew_management`, version **20261029070531**. Source: `backend/migrations/2026_11_16_truck_crew.sql`.
2. `crew_assignment_read_scope`, version **20261029072954**. Source: `backend/migrations/2026_11_17_crew_read_scope.sql`.

Supabase MCP confirmed both migrations. Earlier POD migrations were not rerun.

- `profiles.crew_role` is constrained to DRIVER/HELPER for truckers and NULL for other authentication roles. Inserts default existing-compatible truckers to Driver. Existing **13 trucker profiles** were backfilled to Driver; Admin/Staff classifications remain not applicable.
- Added `trip_truck_crew_members`: assignment/profile foreign keys, unique assignment/profile membership, assignment role, assignment/removal timestamps and actor references. Active lookup indexes support profile and assignment access. Membership removal preserves the row and historical actions. There is no Helper count limit.
- Backfilled **five valid primary-driver assignment relationships** without changing their existing drivers, assignments or operational records. Ended assignments retain removed membership history. A trigger keeps future primary-driver changes synchronized with crew membership.
- Added `crew_version` for optimistic crew edits and a service-only atomic `save_assignment_crew_v1`. Identical retries are no-ops; competing changes require refresh. Crew edits record an existing audit-log entry.
- Added `crew_assignment_access_v1`, reused by delivery and replacement writers. Active membership and an available trucker profile are required. Existing assignment/trip transaction locks prevent racing crew removal and new writes.
- Physical milestone races return the authoritative existing event instead of inserting a duplicate. POD submissions remain independent document submissions; the existing exact document/request idempotency and six-photo rules remain in place.
- Replacement PODs can be submitted by another active crew member. Original documents, review history and uploader ownership of each new photo remain protected.
- New event metadata captures the authenticated actor's profile ID, name and assignment crew role. Subsequent edits preserve that snapshot. Existing recorded_by/uploaded_by/created_by fields are retained. An audit entry records each new delivery event under the real actor.
- Existing rejection notifications fan out once to active crew using the original event key and recipient/event uniqueness. Existing message/action metadata is retained. Unrelated assignments are excluded.
- Updated seven direct-read policies covering assignments, events, cargo allocations, assignment stops, line items, stops and trips. Management reads remain available; crew reads require the relevant assignment relationship. Crew table writes and crew-management RPC execution remain service-only. Profile classification edits are management controlled.
- Archived primary-driver history does not block a later classification edit. An active primary Driver must first be reassigned before changing that account to Helper.

No real operational PODs, deliveries, quantities, CBM or billing records were altered. The authorized profile defaults and membership backfill are the only changes to existing account/assignment metadata.

## Admin and Trucker behavior

Users now has a Crew Role column, searchable values, a Driver/Helper dropdown in Add/Edit User, and an editable Trucker classification column through the existing profile workflow. Account creation, temporary passwords and profile pictures use their existing services. Admin/Staff rows display a dash.

The existing truck-assignment panel includes a compact crew editor. It groups by assignment ID, shows the primary Driver first, sorts Helpers by name, searches existing accounts and pages through candidates. Helpers can be added, removed and replaced without touching cargo/stops. Driver changes still use Edit assignment. Unsaved crew changes participate in the existing close/switch safeguards.

Driver and Helper dashboards use active crew membership instead of primary-driver identity. They share stops, cargo, saved timeline, submitted documents, required actions, progress and assignment reports. Saved POD photos are shared within the exact assignment; personal staged uploads and offline IndexedDB drafts remain scoped to their account. Report and document authorization were updated alongside the delivery endpoints.

New operational events display **Updated by: Name (Driver/Helper)**, or **Submitted by** for PODs. Event details show the same actor. POD review/history uses the captured uploader name/classification. Historical records without a resolvable actor show Unknown; no primary-driver name is invented.

## Realtime and offline behavior

The existing authenticated Socket.IO/Supabase collaboration bridge is reused. Crew changes produce durable operational signals and invalidate the relevant users' assignment lists, including newly assigned and removed users. Trip subscriptions authorize active crew membership. Delivery notifications carry assignment IDs so other assignments need not refresh unnecessarily. Crew changes do not add a polling loop or a separate frontend subscription.

The current server-confirmed event merge and outbox remain authoritative. Shared milestone races preserve the first successful actor/event. Local drafts remain keyed by their creator; another crew member cannot see or overwrite them. Removing a member revokes further assignment access without erasing their saved actions. Lost responses may still reconcile that user's own committed request.

The single-active-device policy remains per profile/account. Logging in as a Helper does not invalidate another crew member's session. Continuous vehicle-location publishing retains the established primary-driver tracking path; every crew member's arrival action still captures and validates that user's own GPS.

## Files changed in this task

Backend:

- `migrations/2026_11_16_truck_crew.sql` (new)
- `migrations/2026_11_17_crew_read_scope.sql` (new)
- `src/models/profile.model.ts`, `user.model.ts`
- `src/routes/trip.routes.ts`
- `src/services/truck-crew.service.ts` (new)
- `src/services/user.service.ts`, `user-workspace.service.ts`, `lookup.service.ts`
- `src/services/delivery-workspace.service.ts`, `trip-convoy.service.ts`
- `src/services/collaboration-auth.service.ts`, `collaboration-server.ts`, `collaboration.logic.ts`
- `src/services/operations-report.service.ts`, `pod-pages.service.ts`, `trip-receipt.service.ts`

Frontend:

- `src/context/AuthContext.tsx`
- `src/services/user-management.service.ts`, `delivery.service.ts`, `collaboration.service.ts`, `receipt.service.ts`
- `src/pages/Admin/views/TruckersView.tsx`, `src/pages/Driver/DeliveryCompanion.tsx`
- `src/components/admin/UserManagementModal.tsx`, `TruckCrewEditor.tsx` (new), `TripConvoyPanel.tsx`
- `src/components/admin/TripOperationalTimeline.tsx`, `TripOperationalInspector.tsx`, `ReceiptReviewCard.tsx`
- `src/components/delivery/DeliveryTimeline.tsx`

Verification/report artifacts:

- `backend/tests/fixtures/pod-integration-fixture.ts`
- `backend/tests/truck-crew.test.ts` (new), `pod-service-integration.test.ts`
- `backend/scripts/verify-truck-crew.cjs` (new, explicitly opted-in isolated live acceptance)
- `frontend/tests/truck-crew.browser.cjs` (new)
- `frontend/tests/artifacts/truck-crew-mobile.png` (new)
- `docs/truck-crew-live-2026-10-29.json`, this report

Unrelated worktree changes were preserved.

## Verification

- Backend and frontend production builds passed. Existing frontend bundle/dynamic-import warnings remain.
- **26 focused tests passed**, covering the new SQL/services and delivery/POD regressions. Updated crew and service checks were repeated after the final receipt/policy changes. Isolated PostgreSQL verifies membership backfill, concurrent milestone deduplication, cross-crew replacement, rejection notification isolation, removal, immutable attribution, service-only permissions and direct-read RLS separation between two assignments.
- **33 Playwright checks passed** across crew UI (4), next-destination workflow (5), product delivery history (7), and POD submission/review/offline synchronization (17). Crew UI checks include Driver default, Helper payload, nine Helper selections, mobile layout and actual Helper attribution.
- **Live acceptance passed against the real backend and connected Supabase**, using separate real account logins and authenticated WebSocket clients: shared workspace, unauthorized access denial, Driver travel and Helper arrival signals, Helper POD submission, notifications to crew, another Helper's replacement as Pending, simultaneous HTTP writes returning one milestone, immediate membership removal, retained attribution and independent account sessions.
- Live acceptance used an ephemeral local listener running the production routes and collaboration server with real Supabase persistence. Admin fixture preparation/review used the real backend services with the authorized existing development Admin profile; it did not use a hardcoded Admin password or a new system role.
- A final live read on the archived test trip confirmed both Helper uploader classifications and original Rejected / replacement Pending statuses after cleanup.
- Supabase confirmed both migration versions, seven scoped policies, service-only crew writes, **zero active test accounts**, and three archived isolated test trips.
- `git diff --check` passed.

Initial acceptance attempts exposed an ambiguous profile FK join and reused synthetic photo bytes; the join was corrected and the replacement image was made distinct. An unconfirmed database response was not treated as success: the same isolated fixture was resumed. The final real workflow passed. All attempted fixtures are retained in the manifest.

Limitations: MCP could not access the Admin login in the user's separate Chrome session. Admin UI interaction used isolated browser transport fixtures; live backend/database and authenticated socket acceptance were separate. A live two-browser/phone UI run and external DeepSeek OCR processing were not repeated. Existing extraction/offline/POD tests and workflows were preserved.

## Isolated test identities and cleanup

The acceptance attempts created **12 unique dummy trucker accounts** across three isolated trips; the final attempt reused the last fixture. All twelve accounts are deactivated and Auth-banned. All three trips are archived, and their dedicated test trucks are inactive. Passwords were randomly generated and kept only in process memory. No password or access token is stored in the verification source or manifest.

The complete account IDs/emails and trip/assignment/document IDs are recorded in `docs/truck-crew-live-2026-10-29.json`. Successful final trip: `997e8ba7-5ca4-49e9-95f3-9cb0c306d2b6`.
