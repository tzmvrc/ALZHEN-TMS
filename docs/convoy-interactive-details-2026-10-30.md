# Interactive convoy Event Details

## Changes and root causes

- Monitoring Truck remained rendered in route mode. Removed the complete selector, its loading skeleton, and its dedicated styling.
- A convoy CSS override imposed unequal panel widths. Removed it; desktop uses two equal columns, with mobile stacking and contained internal scrolling.
- The existing assignment-selection handler cleared the event and stop. It now preserves those identities while selecting by assignment ID. Convoy truck headings support keyboard selection; passive section content also selects. Nested buttons, links, images, review controls, dialogs, and text selections do not switch trucks.
- Selecting a truck projects the retained milestone onto its own saved events, using the existing stop/assignment matcher. Removing the source assignment previously lost the selected milestone; retaining its identity lets the remaining truck show its own saved event or Awaiting Update.
- Selection continues using the existing URL/remembered assignment state. No new queries, subscriptions, backend changes, POD changes, or migrations were introduced.

## Files changed in this task

- frontend/src/components/admin/TripTrackingWorkspace.tsx
- frontend/src/components/admin/ConvoyEventDetails.tsx
- frontend/src/components/admin/trip-operational-workspace.css
- frontend/tests/convoy-event-details.browser.cjs
- frontend/tests/artifacts/convoy-interactive-desktop.png
- docs/convoy-interactive-details-2026-10-30.md

## Verification

- TypeScript project check passed.
- Two focused allocation/convoy matching tests passed with tsx.
- Full Trip Details browser fixtures passed for one, two, and three trucks: selector removal in details/route/refresh, equal panel widths (712px each at the fixture desktop viewport), independent actor/timestamp/remarks, active selection, keyboard interaction, pending truck, nested review/image controls, internal scrolling, selection preservation after collaboration refresh and page refresh, fallback after assignment removal, and mobile stacking without page overflow.
- Playwright MCP independently passed the two-truck flow, including image/review controls and assignment-removal fallback.
- Desktop screenshot inspected. git diff --check passed.

Tests used isolated transport fixtures with the actual frontend components. Collaboration events were simulated; no live operational records were changed and no live multi-client database test was performed. No commit, push, or deployment.
