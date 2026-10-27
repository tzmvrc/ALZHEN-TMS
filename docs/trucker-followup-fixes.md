# Follow-up: Resend, viewer avatars, monitoring, GPS and convoy cards

## Changes completed

1. **Resend diagnosis and feedback.** Reissued only the existing failed request with its original payload and idempotency key to recover the actual provider response. Resend returned HTTP 403 `validation_error`: the testing sender permits the account's own address, `mjaspa9@gmail.com`; `maribethhannahgundaya@gmail.com` is a different, restricted recipient. Backend environment loading confirmed key present, enabled=true and sender exactly `ALZHEN TMS <onboarding@resend.dev>`. Credentials and sender were not modified. No retained Express log files were available; the original outbox had only a generic 403 message. The recovered provider response is now retained on the failed job, including the provider error name.

   The provider-confirmed account is stored privately and bound to a server-only API-key hash. An incorrect editable account address cannot override that confirmed identity. Frontend and backend reject known-ineligible test recipients before queueing; manual retry is rejected for a restricted recipient. The existing job remains BLOCKED with attempts=1. The recipient was never silently replaced.

   Test sending has animated busy feedback, an idempotent request key, queued/processing/retry/acceptance/delivery/failure distinctions and Realtime history. A bounded backend-only reconciliation step retrieves accepted messages' provider status; accepted messages are never resent to discover delivery. Confirmed delivery is saved separately from acceptance. Provider-read failures preserve acceptance instead of falsely claiming delivery. A provider key without read permission can still send but cannot confirm delivery through this API.

2. **Viewer avatars.** The original TableViewers avatar stack, photos, colored initials fallback, entry/leave/confetti animation and details popup are restored beside search. Hover names, circular borders, compact presence indicators, count/overflow and keyboard focus remain. The generic people icon is removed. Unchanged viewer metadata avoids unnecessary avatar state rerenders.

3. **Monitoring controls and timeline.** The assignment dropdown is replaced by compact horizontally scrolling truck buttons with plate/driver, blue selected state, subtle truck watermark and focus/hover feedback. Selection still scopes timeline, cargo, evidence, POD and map. Removed an assignment-only map feedback loop that could restore the previously selected truck after a new selection. Evidence/remarks badges cannot appear on pending or derived transit milestones; confirmed warehouse departure still activates the selected truck's derived On the Way stage.

4. **Trucker and map.** The yellow primary action spans the full navy card at phone/tablet widths. Arrival-only GPS policy remains unchanged in frontend/backend/offline queue; Departed Warehouse saves without GPS acquisition and attaches no invented fix. A departure with no newer actual fix exposes a separate `positionFallback` with source WAREHOUSE_ESTIMATE, departure timestamp and saved verified warehouse coordinates. This never enters tracking-location storage or the live GPS position field. The map and context label it as an estimate, do not infer movement, and retain the last actual location timestamp. A newer reported fix replaces the estimate; invalid/missing warehouse coordinates yield Location Unavailable. Background location sharing remains independent.

5. **Convoy cards.** Visual View receives every active assignment's driver/profile photo in batched metadata queries, independent of whichever product row falls on the page. Avatars reuse TableViewers, deduplicate drivers, retain multiple plates, offer +N and an accessible details popup. Company/plate summaries reflect the convoy. Both Visual View and Trip Details now call `confirmedStateProgress` over the same authoritative assignment/stop/POD projection. Required unassigned stops retain pending units; custom/derived travel events do not inflate completion. Cards and header reuse the shared RoadProgress component, road animation and truck marker. Motion preference and offscreen card containment keep the visual lightweight. Existing scoped event reconciliation refreshes these values.

The unresolved report.service.ts merge markers found at entry were resolved by preserving the upstream workbook/category/store-call enrichments and the confirmed operational projection. A confirmed assignment departure is protected from the upstream parent timestamp fallback. No repository reset or unrelated staged changes were discarded.

## Migration

Created and applied to the connected Supabase project:

`backend/migrations/2026_10_28_operational_email_provider_feedback.sql`

Applied name: `operational_email_provider_feedback`.

Adds private provider-confirmed testing identity, provider error/status-check/delivery-observed metadata, and a partial status-reconciliation index. Existing RLS, job claiming/idempotency and formal Backload/Offload/Demurrage queue triggers are retained. No production delivery records were created, reset, or deleted.

## Resend verification

- Restricted address preflight: HTTP 422 before queueing; retry also HTTP 422. Existing failed job `b6c16c3d-ed91-493b-bb7d-fa99bbe5ee7c` remains blocked, one attempt.
- Official test address: `delivered@resend.dev`.
- New test outbox ID: `0b0148f6-654b-4480-bece-5b3877be8e99`.
- Provider ID: `01a17cb3-2321-7de5-991b-7e973f63f3bc`.
- Resend accepted it and later returned `last_event=delivered`. Database reconciliation also persisted provider_status=delivered with a delivery-observed timestamp. This confirms delivery to the official testing sink; no ordinary external mailbox delivery is claimed.
- The sender and environment values remain unchanged. No email was sent to the restricted recipient during the new success test or substituted for it. The diagnostic replay returned the same explicit rejection.

Normal external recipients still require a verified sender domain. For the existing default sender, explicitly choose `mjaspa9@gmail.com` or the official test address. No new account, key, hosting, deployment or domain purchase is needed for local testing.

## Verification

- Backend and frontend production builds pass. Existing Vite large-chunk/dynamic-import warnings remain.
- **33 focused tests pass** across confirmed SQL workflow, arrival-only GPS/offline validation, notifications, reports/import/decimal precision, convoy, deletion safety, weighted progress/timeline, provider idempotency and testing-account diagnosis, and read-only routing. New routing assertions prove departure fallback remains separate from actual GPS, actual recovery replaces it, missing coordinates do not invent a location, and assignments remain isolated.
- Playwright settings/avatar test passes at 320/360/390/430/768/1440px: recipient configuration, preflight blocking, queued/accepted/delivered/retry history, restored viewer stack, popup and toolbar position.
- Playwright convoy test passes with actual workspace/card/panel components and isolated API transport: horizontal buttons, selected assignment isolation, no unsupported dot, photos/fallback/overflow/dedup, matching weighted percentage, estimate-to-GPS recovery, mobile scrolling and reduced motion. Mapbox rendering is stubbed in that transport fixture; backend routing and UI labels are exercised separately.
- Playwright Trucker two-stop workflow passes with isolated transport: explicitly clears GPS cache and denies permission before departure, confirms no new GPS request or fabricated GPS payload, checks full button width at 320/390/768px, confirms location sharing is offered for the following arrival, and verifies available background GPS attaches to custom updates. Existing save confirmation/idempotency, offline photos, compression, POD separation and stop sequencing remain passing.
- Playwright inline POD regression passes for selected assignment, OCR correction, approval/rejection, shared image gestures and realtime progress.
- Read-only live Master List card metadata resolved three assigned drivers and three authoritative stop-state rows. No per-card API fetch or subscription was added.
- Live checks confirm restriction persistence, delivered test evidence, applied migration and that the testing key hash is omitted from Admin API settings output.
- No real production milestone, simulated production GPS, trip deletion, or unauthorized recipient send was used in verification. Physical GPS hardware, camera hardware and a full live authenticated delivery were not exercised.

Local browser runners/screenshots are ignored artifacts under `.playwright-mcp`. Reusable browser assertions are listed below. No commit, push or deployment was made.

## Exact files changed in this follow-up

- `backend/migrations/2026_10_28_operational_email_provider_feedback.sql`
- `backend/src/services/operational-email.service.ts`
- `backend/src/services/report.service.ts`
- `backend/src/services/road-routing-read.service.ts`
- `backend/tests/confirmed-operational-workflow.test.ts`
- `backend/tests/operational-email.test.ts`
- `backend/tests/road-routing-read.test.ts`
- `docs/trucker-followup-fixes.md`
- `frontend/src/components/admin/DispatchVisualCards.tsx`
- `frontend/src/components/admin/OperationalEmailSettings.tsx`
- `frontend/src/components/admin/RoadRouteMap.tsx`
- `frontend/src/components/admin/RoadRoutingPanel.tsx`
- `frontend/src/components/admin/TableViewers.tsx`
- `frontend/src/components/admin/TripOperationalTimeline.tsx`
- `frontend/src/components/admin/TripTrackingWorkspace.tsx`
- `frontend/src/components/admin/trip-operational-workspace.css`
- `frontend/src/components/delivery/delivery-workspace.css`
- `frontend/src/components/ui/RoadProgress.tsx`
- `frontend/src/components/ui/road-progress.css`
- `frontend/src/services/operational-progress.ts`
- `frontend/src/services/road-routing.ts`
- `frontend/src/workspace.css`
- `frontend/tests/convoy-followup.browser.js`
- `frontend/tests/delivery-confirmed-workflow.browser.js`
- `frontend/tests/operational-progress.test.ts`
- `frontend/tests/operational-settings.browser.js`
