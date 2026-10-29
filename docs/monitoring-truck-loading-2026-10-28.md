# Monitoring Truck loading fix — 2026-10-28

## Confirmed cause

The Admin Trip Details page rendered its core trip response first, but started `/trips/:id/assignments` only afterward. It then held those assignment results in a `Promise.allSettled` barrier with stops, cargo, events and operational reports. `TripTrackingWorkspace` independently hid the selector until its full convoy response existed AND the parent page-wide loading flag cleared. Assignment plates/names already available from the small assignment response therefore could not render until unrelated requests finished.

Backend inspection found that assignment relationship reads already batch and parallelize driver, truck and company lookups. The convoy endpoint legitimately loads allocations, stops and confirmed milestone state, which the selector does not need. Read-only Supabase MCP checks confirmed existing trip-assignment indexes; a representative assignment list query executed in **0.719 ms** (planning **5.008 ms**). This measures database execution only, not authenticated API/network latency. No database or backend change was warranted.

## Changes

- Start the existing cached assignment request alongside the initial trip request; render only after the authorized core trip response exists.
- Publish assignment results independently of optional sections. Reuse the existing token/trip-scoped API cache and screen snapshot; no new endpoint, polling or subscription.
- Render buttons whenever assignments exist, including single-truck trips. Use a compact accessible skeleton while no assignments are available.
- Keep loaded buttons during background refresh/failure. Retain valid URL selection after reload and remember the default selection while convoy enrichment changes row order. Reject another trip's assignment selection.
- Preserve button colors/labels and independent cargo/POD/map selection. On mobile, keep truck buttons horizontally scrollable and put management actions on their own row.

Files changed for this task:

1. `frontend/src/pages/Admin/views/TripDetailView.tsx`
2. `frontend/src/components/admin/TripTrackingWorkspace.tsx`
3. `frontend/src/components/admin/trip-operational-workspace.css`
4. `frontend/tests/monitoring-truck-loading.browser.cjs`
5. This report.

Pre-existing worktree changes were preserved.

## Before/after measurement

Both runs mounted the actual Trip Details component in Chromium with synthetic intercepted REST responses. Modules were loaded before timing started to isolate the data/render path. Identical response delays: core trip **200 ms**, assignments **300 ms**, convoy **2400 ms**, reports **3200 ms**, events **1800 ms**, cargo **2100 ms**, receipts **2700 ms**. Timing includes browser scheduling and render overhead; these are controlled local measurements, not production latency claims.

| Measurement | Before | After (final run) |
| --- | ---: | ---: |
| Multi-truck buttons visible | 3955 ms | 602 ms |
| Assignment request starts after opening | 285 ms | 63 ms |
| Single-truck selector | Previously hidden | 544 ms |
| Completed API responses observed before buttons | 11 | 5 |

Multi-truck display improved by approximately **85%**. Earlier successful after-runs ranged from **517–551 ms**. The final run includes the stable default-selection safeguard and reversed convoy row order.

Only the core trip and assignment responses are now required to display the selector. Other fast responses may finish incidentally (the five observed responses are not five dependencies). The former barrier involved the core trip, five child section requests and convoy. Existing operational requests remain necessary for their sections: **no total page queries were removed and no extra queries were introduced**. Exactly one assignment-list request was made on cold load; switching trucks produced **zero additional assignment-list or convoy-list requests**. Existing assignment/GPS/POD caches and subscriptions remain in use.

Raw timing/request records: `.playwright-mcp/monitoring-truck/before.json` and `after.json`. The historical `requiredResponses` key in those artifacts lists responses completed before visibility, not the dependency set.

## Verification

- Frontend `npm run build`: passed, including TypeScript. Existing Vite chunk-size/dynamic-import warnings remain.
- `git diff --check`: passed.
- Focused unit tests: **12 passed**, covering operational progress, timeline isolation and per-document POD status.
- New real-page Playwright loading suite: **9 checks passed** across single/multiple trucks, independent slow requests, skeleton, differently ordered convoy enrichment, switching without assignment refetch, failed background refresh, selected truck after reload, cross-trip isolation, desktop/mobile layout. No page errors or operational writes.
- Existing POD redesign browser suite: **11 checks passed**, including approval/rejection, replacement, save, immediate state propagation, unchanged cargo values and responsive review.
- Playwright MCP directly verified both plate/driver labels, selected state and mobile fit while parent loading remained true.
- Existing convoy/map browser scenario: **9 checks passed** through MCP, including three truck assignments, shared progress, GPS replacing a warehouse estimate, assignment-specific map context, reduced motion and widths **320, 360, 390, 430, 768, 1440**. The old fixture had a stale expected progress value (13 instead of the current 14) and lacked the delivery-workspace response introduced by the existing POD implementation. An artifact-only copy supplied the current expectation/response; the original unrelated test file and production progress/map code were preserved.
- Screenshots: `.playwright-mcp/monitoring-truck/mobile.png`, `desktop.png`, and `.playwright-mcp/convoy-followup.png`.

All browser activity used synthetic transport, with no operational record mutations. Live Supabase activity was read-only. Live authenticated production HTTP latency, real GPS hardware and physical phones were not exercised. No schema migration, commit, push or deployment was performed.
