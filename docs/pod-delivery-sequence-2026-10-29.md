# POD delivery sequence correction — 2026-10-29

## Root causes

- The next-action calculation reused stop-wide document readiness. A confirmed POD could therefore still leave Upload POD required when other DRs had no documents.
- Database departure/completion checks and the confirmed-stop view coupled physical completion to Admin approval. Frontend progress projections repeated that coupling.
- Timeline endpoints returned delivery events without persisted review events, and the Admin projection grouped events by workflow order instead of recorded time.
- The current-stage label followed the latest upload, allowing a late replacement to visually roll back an unloading/completed stage.

## Changes

Confirmed POD_SUBMITTED milestones now advance the operational sequence independently of approval. The outbox merges only a successful server acknowledgement into the current workspace while refreshing it; locally queued drafts cannot advance progress. An unresolved replacement request takes priority even after delivery completion, without deleting or repeating saved milestones. Unrelated failed drafts do not disable the next delivery action.

Admin and Trucker APIs include review activity from persisted pod_review_events, joined through the receipt ID and filtered by trip/assignment. These rows are read-only review activity, not new physical milestones. Actual timestamps determine chronology. An outstanding replacement is explicitly a pending action; resolving it removes that pending action while retaining rejection and submission history.

OCR tabs are fixed at 276 × 76 px, retain status colors and the active border, and scroll horizontally.

## Database change

Applied `pod_operational_progress`, Supabase migration version `20261029031421`, to the confirmed project `hdmknewarynwpbrhfgai` using Supabase MCP. Source: `backend/migrations/2026_11_14_pod_operational_progress.sql`.

The existing writer uses submitted-POD readiness for departure/completion, while the separate approval-readiness branch remains available. Non-approval readiness accepts a matching submitted POD without requiring all other DRs at the stop. The confirmed-stop view derives physical completion/date from the persisted departure. Replacement guards, assignment authorization, milestone predecessors and service-only writer permissions remain intact.

No data backfill or operational-record changes were made. No cargo quantities, billing values, POD documents or audit history were changed. Existing migrations were not rerun on the live project. Supabase schema checks confirmed the writer gate, readiness branch, completion view and service-only permissions.

## Files changed in this task

- Backend: `src/services/delivery-workspace.service.ts`, `trip.service.ts`, new `pod-review-timeline.service.ts`; migration above.
- Frontend services: `delivery.service.ts`, `delivery-outbox.ts`, `operational-progress.ts`, `operational-timeline.ts`.
- Frontend UI: `pages/Driver/DeliveryCompanion.tsx`, `components/delivery/DeliveryTimeline.tsx`, `components/admin/TripOperationalTimeline.tsx`, `TripOperationalInspector.tsx`, `pod-review.css`.
- Verification: `backend/tests/fixtures/pod-integration-fixture.ts`, `pod-workflow-integration.test.ts`, new `pod-late-rejection.test.ts`; `frontend/tests/operational-progress.test.ts`, new `pod-delivery-sequence.test.ts`, new `pod-chronology.browser.cjs`, `pod-review-resubmission.browser.cjs`, `pod-submission-review.browser.cjs`; regenerated mobile review screenshot.

Other pre-existing worktree changes were preserved.

## Verification

- Backend and frontend production builds passed.
- 19 focused unit/integration tests passed. Isolated PostgreSQL tests exercise the actual writer and triggers: Pending permits unloading/completion, rejection after unloading/completion requires replacement, replacement stays Pending, and physical event IDs/timestamps, quantities and billing remain unchanged.
- 28 Playwright checks passed across chronology (4), review/resubmission (7), and submission/review (17). Coverage includes immediate Started Unloading after acknowledgement, offline retention/reload/synchronization, unrelated failed-draft isolation, chronological review activity, history, tab dimensions and mobile layouts.
- Live read-only backend/Supabase checks on the archived isolated test trip returned the original POD, persisted rejection and replacement in chronological order. Combined paginated delivery/review events contained eight distinct rows across two pages with correct assignment isolation.
- `git diff --check` passed.

Limitations: the browser suites use isolated API fixtures. No new live submission, rejection, unloading or completion was performed in this task; late-stage scenarios were verified against isolated PostgreSQL and real backend services rather than live operational records. Live checks were read-only apart from the confirmed schema migration. No commit, push or deployment was performed.
