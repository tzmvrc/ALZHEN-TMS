# Database lookup deletion ? approved and applied

User approved the exact proposal in this session. Applied successfully as `20261021170321 ? database_lookup_reference_clearing` to project `hdmknewarynwpbrhfgai`. Read-back confirmed all three SET NULL constraints, nullable assignment truck references, LEFT JOIN totals, and service-only RPC execution. Operational counts before/after were unchanged (trips/stops/assignments/cargo: zero; truck images: one). No production deletion was used to verify it.

Exact SQL: `backend/migrations/2026_10_22_database_lookup_reference_clearing.sql`.

## Inspected live relationships
- Assignment truck: NOT NULL + RESTRICT. Proposed nullable + SET NULL, retaining the physical assignment, stops, driver, quantities, allocation IDs and trip.
- Stop store: nullable + RESTRICT. Proposed SET NULL. Existing immutable converted-unloading stops still block deletion and roll back the entire record operation.
- Cargo source warehouse: nullable + NO ACTION. Proposed SET NULL.
- Companies, products and contacts already have eligible SET NULL links. No changes to those constraints.
- Truck images: NOT NULL + CASCADE. Stores own contacts and exceptions through NOT NULL + CASCADE. Leave these unchanged and keep the RPC blocking deletion while these owners have dependent records. No files or child history are deleted.

## Trigger and view review
The cargo guard currently rejects a null assignment truck with allocated cargo. The proposal permits only a referential clear after the old truck has actually disappeared; ordinary truck changes retain existing capacity validation. Assignment identity and allocated cargo remain intact, with unknown capacity until reassigned. Scheduling/driver guards and converted-report guards are retained.

Operational sheet projections use LEFT JOINs for lookup data. The assignment-totals view currently uses an INNER JOIN to trucks; the proposal changes that join to LEFT JOIN so assigned CBM remains visible with an unknown capacity after truck removal; missing truck/store/warehouse values remain blank without removing source trip/stop/cargo rows. Existing change signals and collaboration-version triggers handle the updates.

The service-only deletion RPC locks the owner, checks every incoming FK, blocks all populated non-SET-NULL relationships, and audits the original record plus cleared-reference row IDs before deletion. Per-record transactions are atomic; bulk requests explicitly report partial outcomes. No schema-column deletion, operational cascade, Storage deletion, RLS widening or production test deletion is proposed.

## Recovery
Before application, save original function definitions and constraint metadata to the migration record. Transaction failure automatically rolls back the DDL. Before any user deletion, reverting requires restoring the original three constraints, the truck NOT NULL property, original INNER JOIN assignment-totals view and original function definitions. After confirmed user deletion, a schema rollback alone cannot restore deleted data: restore the original lookup UUID/content and only the audited reference IDs that remain NULL, using a reviewed recovery transaction or backup. Never restore references over newer user edits. Disable lookup deletion while recovering. The NOT NULL rollback requires resolving all newly-null truck references first.

## Remaining blocks
Image-owned trucks, stores with contacts/exceptions, product photos and protected converted-stop history require a separately reviewed archival/ownership strategy. They remain blocked, not cascaded or silently detached. Approval of this proposal does not authorize deleting existing records for testing.
