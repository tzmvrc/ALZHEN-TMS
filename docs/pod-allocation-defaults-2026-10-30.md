# Allocation-based POD defaults

## Root causes

The POD sheet initialized selection as empty. Catalog/header-DR changes and every OCR result then selected cargo by detected product names; removing a photo could deselect detected products. Quantity defaults used the full allocation, without deducting other active POD coverage. Existing database scope validation capped each receipt against its allocation but did not atomically cap coverage across submissions.

## Implementation

- New POD forms select eligible allocation IDs for the authenticated assignment and selected authorized stop, across all DRs. Defaults use assigned quantity minus existing Pending/Approved receipt coverage. Physical unloaded/remaining quantities remain independent, so rejected PODs can be replaced after unloading.
- Multi-image receipts count once by submission event. Rejected receipts do not consume active coverage. Legacy receipts only participate when existing allocation matching is unambiguous; missing legacy quantities are treated conservatively as full coverage.
- Defaults run once after the catalog is available. Saved drafts and rejected-source product selections take precedence. OCR, image removal/addition and catalog refresh never modify selection or quantities.
- Changes remain editable, with exact allocation/line/assignment/stop/product/DR identities saved through the existing Product Selections metadata. Legacy model summaries remain for compatibility; allocation quantities are not merged in the checklist, saved selections or Admin product review.
- Checklist rows show bold model, separate DR, editable quantity and maximum. Selected chips include each allocation's DR/quantity, and the trigger summarizes count/units. Empty catalogs show a clear message. Ineligible saved selections remain removable; submission requires current authorization and coverage.

## Files changed in this task

- frontend/src/pages/Driver/DeliveryCompanion.tsx
- frontend/src/services/pod-cargo-selection.ts
- frontend/src/components/delivery/RelatedDrSelect.tsx
- frontend/src/components/delivery/delivery-workspace.css
- backend/migrations/2026_11_25_pod_allocation_coverage.sql
- backend/tests/pod-allocation-coverage.test.ts
- backend/tests/pod-service-integration.test.ts
- frontend/tests/pod-allocation-defaults.test.ts
- frontend/tests/pod-allocation-defaults.browser.cjs
- docs/pod-allocation-defaults-2026-10-30.md

## Database

Confirmed configured Supabase project hdmknewarynwpbrhfgai and inspected live tables, writer/replacement RPCs and triggers before editing. Applied only new migration pod_allocation_coverage, version 20261030042650. Supabase confirmed success, trigger presence and restricted function privileges.

The new trigger uses the existing trip-first lock order to serialize competing receipt coverage checks. It validates explicit selections against unconsumed coverage, counts each submission once and excludes the current submission's other pages. It leaves ordinary field corrections and unchanged historical selections alone. No physical quantities, billing, events or existing records were rewritten. Existing submit/replacement RPC idempotency is unchanged.

## Verification

- TypeScript project check passed.
- New allocation-default and SQL coverage tests passed: multi-DR/repeated model identities, stop/truck isolation, partial coverage, multi-image deduplication, rejection/replacement capacity, unchanged allocation quantities, and rejection of excess coverage.
- Existing backend service integration passed with the migration: submit/list/reject/notification/replacement/idempotent replay/approve/history and unchanged physical quantities.
- Six existing Admin product matching and allocation/convoy tests passed.
- Isolated real DeliveryCompanion browser checks passed: defaults before OCR, editable partial quantities/deselection, conflicting OCR, extra retained images, catalog collaboration refresh, offline save/reload/repair, and rejected-source replacement restoration.
- Playwright MCP exercised the same isolated flow and independently confirmed replacement selection/quantity, other allocation deselection and no mobile page overflow.
- git diff --check passed.

Workflow tests used isolated browser transports and local PostgreSQL fixtures; no live operational PODs were submitted, approved, rejected or modified. Live Supabase verification covered migration/schema/permissions. Independent simultaneous live-user submissions were not performed; database serialization was inspected and sequential excess-coverage rejection was tested. No commit, push or deployment.
