# Offload deletion PostgreSQL fixture

Run only against a newly created disposable local PostgreSQL 18 cluster. The
schema and assertion files create and delete synthetic records. Never point
these commands at Supabase or an existing development database.

The implementation run initialized a new cluster under `%TEMP%/alzhen-offload-pg-*`,
bound it to `127.0.0.1:55439`, checked `SHOW data_directory` against that exact
new directory, and created fresh `offload_test_<guid>` databases. Existing local
PostgreSQL service/databases were untouched. The private server was stopped
after verification; files were retained for review.

From the repository root, after creating/verifying your private cluster and a
fresh database, the actual test sequence is:

```powershell
psql -w -h 127.0.0.1 -p 55439 -U fixture -d $fixtureDb -v ON_ERROR_STOP=1 `
  -f backend/tests/fixtures/offload-deletion-schema.sql `
  -f backend/migrations/2026_10_21_offload_deletion_cleanup.sql `
  -f backend/tests/fixtures/offload-deletion-assertions.sql
```

The SQL asserts physical ownership, snapshots, owned-item/receipt deletion,
preservation of three stops, protected source/target conversion history,
retained-document protection, rollback on another restrictive FK, no-image
completion, authorization, and repeated-request identity. A separate two-session
test invoked the RPC concurrently for a new synthetic Offload and checked both
calls returned the same operation ID.

The fixture represents the relevant schema and a source immutability trigger;
it is not a full copy of every production trigger. Storage failure/retry is
tested separately with mocks in `backend/tests/offload-cleanup.test.ts`.
No production deletion or live Storage write was performed by these tests.

## Permanent transaction deletion fixture

In another NEW database in the same verified disposable cluster, run:

```powershell
psql -w -h 127.0.0.1 -p 55439 -U fixture -d $fixtureDb -v ON_ERROR_STOP=1 `
  -f backend/tests/fixtures/offload-deletion-schema.sql `
  -f backend/tests/fixtures/transaction-deletion-schema.sql `
  -f backend/migrations/2026_10_22_transaction_deletion_cleanup.sql `
  -f backend/tests/fixtures/transaction-deletion-assertions.sql
```

This tests three-stop/shared-assignment isolation, archived sibling preservation,
parent cleanup, owned operations/items/POD/flex data, exact receipt/image manifests,
snapshots, repeat identity, role denial, private journal ACLs, financial/history
protection, retained source-item protection, uncertain attachment blocking, and
rollback of child deletions/journal insertion on an unexpected restrictive FK.
PostgreSQL 18 may return `23001` for RESTRICT, as well as `23503` for FK failures.
Two independent local psql processes also returned the same operation ID for
concurrent deletion of a synthetic transaction. Storage failures and acknowledgement
failures are mocked in transaction-deletion.test.ts; no real Storage was removed.
This representative schema is not a complete production trigger/schema clone.


## Secure Admin/Staff change signal fixture

In a NEW database in the verified disposable PostgreSQL 18 cluster, execute:

```powershell
psql -w -h 127.0.0.1 -p 55439 -U fixture -d $fixtureDb -v ON_ERROR_STOP=1 `
  -f backend/tests/fixtures/admin-change-signals-schema.sql `
  -f backend/migrations/2026_10_23_admin_change_signals.sql `
  -f backend/tests/fixtures/admin-change-signals-assertions.sql
```

Uses synthetic profiles/session claims, all 51 source relations, statement-trigger
signals and rollback. Tests authenticated role/RLS denial and metadata-only payloads;
no production table read privileges are granted. A non-logical local wal_level can
verify the publication catalog but cannot prove websocket delivery. The assertions
roll back their synthetic writes. This representative schema is not a full clone.

Existing Offload and transaction deletion assertions were also executed with the
new signal migration installed in two additional NEW disposable databases. Missing
unrelated source tables were supplied as local-only stubs, with auth.uid/session
metadata/publication helpers. The owned-record, protected-history, sibling and
rollback assertions pass with statement signals enabled. Storage behavior is still
mocked by service tests; no production records or Storage objects were deleted.


## Tracker pagination proposal fixture

Only in a NEW disposable PostgreSQL 18 database in the verified owned cluster:

```powershell
psql -w -h 127.0.0.1 -p 55439 -U fixture -d $fixtureDb -v ON_ERROR_STOP=1 `
  -f backend/tests/fixtures/tracker-pagination-schema.sql `
  -f backend/migrations/2026_10_24_proposed_tracker_pagination.sql `
  -f backend/tests/fixtures/tracker-pagination-assertions.sql
```

The exact approved file was applied to Supabase as `20261016020431` after user
approval. Do not rerun it there. These commands are only for NEW disposable databases.
The representative fixture checks stable stop IDs, completed/history eligibility,
assignment ambiguity, search fields, legacy override behavior, service-only access,
stop-scoped changes and deletion visibility. It is not a clone of production and
cannot establish actual authenticated Supabase Realtime behavior. No production
writes or Storage deletions were performed by these fixture tests. The application
now defaults to pagination; `VITE_TRACKER_PAGINATION=false` retains a rollback path.
