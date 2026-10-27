# Trucker and operational timeline refinements

Implemented October 27, 2026. No commit, push, deployment, credential change, or operational record mutation was performed.

## Behavior

- Both login pages use Remember Me, compact spacing, `autocomplete="username"` and `autocomplete="current-password"`. The existing Supabase restore policy is retained. The custom remembered value is only the email; disabling the checkbox removes it on successful login.
- Active Sessions is a plain blue underlined number. Its entire spreadsheet cell supports click, Enter, Space and visible focus. The responsive modal shows account name/role, active count, browser/OS, login/activity/expiry and status. Existing confirmed revoke, password change and lock/unlock workflows remain intact.
- Operational phases merge deduplicated saved statuses and milestones by server timestamp. Assignment and stop scope remain explicit; historical records without an assignment are labeled Trip-wide. Generic incidents remain activity, while the Offload / Backload / Demurrage section contains actual report references/records only.
- The timeline keeps 146px milestones, horizontal scrolling, visible-window rendering, severity colors and clickable details/evidence. Current/new progress centers within the strip; completed phases scroll to the end. Identical refreshes preserve manual scroll. Pending milestones do not receive completed connector animation, and reduced motion is supported.
- Operational report changes refresh only report data; status/image changes refresh events. Reconnects reconcile authoritative snapshots. Report archive data loads on opening, and Trucker history avoids subscribing twice to the same parent-managed refresh stream.
- Session/account changes use private backend Realtime signals. Healthy connections avoid repeated frontend security polling; disconnected clients retain recovery checks and foreground validation. A security change arriving during validation queues a further validation, and listeners stop on unmount. Protected backend authorization remains mandatory.
- Mobile forms constrain input/file widths, preserve usable cargo inputs, fit dialogs to the visual viewport and retain internally scrolling content and action footers.

## Applied Supabase migrations

- `backend/migrations/2026_10_27_device_security_realtime.sql` — applied as `device_security_realtime`.
- `backend/migrations/2026_10_27_trip_operational_realtime.sql` — applied as `trip_operational_realtime`.

Both signal tables have RLS, deny direct browser access, and publish only through the existing service-role backend bridge. They contain revision/scope metadata, not event contents, credentials or session tokens. Activity-only device heartbeats do not generate security notifications. Operational triggers cover images, loading/unloading, backloads/offloads, demurrages/incidents, report receipts and POD records, including both affected trips when a report moves. Read-only checks verified the applied migration names, table access, publication membership and triggers in connected Supabase.

## Changed application files for this follow-up

Backend: `src/services/collaboration-server.ts` and the two migrations above.

Frontend:

- `src/pages/Admin/LoginPage.tsx`, `src/pages/Driver/LoginPage.tsx`
- `src/pages/Admin/views/TruckersView.tsx`, `src/components/admin/DatabaseSpreadsheet.tsx`
- `src/components/admin/DeviceSessionsModal.tsx`, `session-cell.css`, `useSessionUpdates.ts`
- `src/pages/Admin/views/TripDetailView.tsx`
- `src/components/admin/TripTrackingWorkspace.tsx`, `TripOperationalTimeline.tsx`, `TripOperationalInspector.tsx`, `trip-operational-workspace.css`
- `src/services/operational-timeline.ts`, `operational-timeline-icons.ts`, `collaboration.service.ts`, `admin-change-feed.ts`, `delivery.service.ts`
- `src/context/AuthContext.tsx`
- `src/pages/Driver/DeliveryCompanion.tsx`, `src/components/delivery/DeliveryTimeline.tsx`, `delivery-workspace.css`
- `src/components/account/AccountUi.tsx`, `src/components/ui/useDialogViewport.ts`

Tests: `frontend/tests/operational-timeline.test.ts`, `operational-timeline.browser.js`, `delivery-workspace-loading.browser.js`, `device-sessions.browser.js`, `device-auth-flows.browser.js`; `backend/tests/operational-realtime-socket.test.ts`, `realtime-signal-migrations.test.ts`.

## Verification

- Backend and frontend production builds pass. Existing Vite bundle size and mixed static/dynamic import advisories remain.
- Focused lint passes for TripOperationalTimeline and TripTrackingWorkspace. The broader check still reports existing AuthContext export/memoization/dependency conventions; it is not claimed as a clean repository-wide lint run.
- 25 focused automated tests pass: 11 frontend timeline/POD/GPS checks, 11 backend authentication/session/delivery/tracking checks, and three SQL migration/Socket.IO checks.
- Playwright exercises the actual saved trip snapshot using isolated authentication/transport, all three action forms, History/Reports, Profile/Settings, and layouts at 320, 360, 375, 390, 430 and 768px. Dialogs also fit a 390px-high viewport. GPS denial, recovery and confirmed-save warnings pass.
- Playwright exercises the actual saved directory/session snapshot: backend count, link styling, clicking cell padding, Enter activation, responsive modal sizing, confirmation, revoke, lock/unlock and password form.
- Playwright uses the real AuthProvider with isolated transport: secure restore, both logout entry points, revocation, locked screen/login rejection, fresh login after unlock, no custom password storage and removal of remembered email when disabled. Both portal login layouts and password-manager attributes are checked.
- Playwright uses the real trip workspace/timeline/inspector with isolated authoritative event APIs: 60-status virtualization, colors, fixed widths, chronological updates, unchanged-refresh scroll preservation, Realtime insertion, centering without page movement, completed end alignment, report refresh without convoy reload, explicit None values and image preview.
- Socket tests run real Socket.IO clients with isolated database change callbacks. They verify affected-account security delivery, assignment-authorized trip notices, deduplication and absence of private event/session payloads. Local PGlite verifies SQL trigger behavior and browser-role denial.

## External verification limits

No live credentials were supplied and no live account was locked/revoked or operational milestone submitted. Browser security/write scenarios use isolated transport, and the saved-data review does not claim a live John Doe login. Physical camera/GPS behavior, OS keyboard behavior and a deployed browser-to-Supabase change cycle require the user's devices and running updated server. Existing Mapbox and OCR functionality is preserved; external map/OCR service availability was not established by these isolated checks. The local code and connected database migrations are ready; deployment remains explicitly outside this task.
