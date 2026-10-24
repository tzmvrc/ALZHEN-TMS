# Demo Master List cleanup — 2026-10-24

The user explicitly requested deletion of all demo records from Trips / Master List.

Read-only inspection found 120 Master List rows belonging to exactly 30 trips with dispatch numbers `DEMO30-20261024-001` through `030` and remarks marker `[ALZHEN_DEMO30_V1]`. No other trips were present. Both existing whole-trip deletion previews reported no blockers, financial records, attachments, or pending uploads.

The connected Supabase SQL operator invoked the existing `delete_whole_trips_v1` procedure in batches of 20 and 10 inside one atomic SQL block. The block checked the exact expected demo count and marker, rejected unverified Master List trips, rechecked previews, required journal acknowledgements, and verified deletion before committing. Journals include a `maintenance_request` explaining the explicit user request, demo scope, and connected SQL operator origin. No constraints or retention checks were disabled.

Verified afterward:

- Master List rows, trips, stops, line items, truck assignments, cargo allocations and assignment stops: **0**.
- Events and driver updates belonging to the demo trip IDs: **0**.
- Distinct deleted demo trips in the cleanup journals: **30**.
- Cleanup journals: **60 COMPLETE**, **0 incomplete**.

This operation removed trip records and their dependent data through the existing cleanup procedure. It did not clear customer, store, product, warehouse, truck or driver catalogs.

The bulk-delete UI was also corrected: its labelled action stays visible before selection and above the existing 20-trip limit. Oversized selections show an inline explanation. An isolated browser test verifies the 30-trip limit message, 20-trip impact preview, clearing selection, single-trip action, and unchanged Admin restriction. No browser test deletes production data.
