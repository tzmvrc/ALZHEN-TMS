# Operations report conversion database integration test plan

These are database-level cases for an isolated Supabase/PostgreSQL test project.
They were documented locally but **not run**; applying the local migration or
connecting to Supabase was outside this task's permission.

## Fixture requirements

- Create one trip, two stops on that trip, and one stop on a second trip.
- Create valid source and target rows for Loading, Unloading, Backload, and
  Offload, including the actual defaulted/generated IDs and report columns.
- Create receipts with each known parent type and complete metadata. Include
  trip-scoped, matching-stop, and mismatched-stop cases where permitted by the
  live constraints.
- Create one Backload with at least one `backload_items` row and one Offload
  with at least one `offload_items` row. Include the Offload-only `reason`.
- Use ADMIN, STAFF, TRUCKER, and a nonexistent profile ID as actor inputs.

## Required cases and assertions

1. **Authorization:** ADMIN and STAFF may reach conversion validation. A
   TRUCKER, nonexistent profile, and null profile ID are rejected. No target,
   receipt, or ledger row is created on rejection.
2. **Twelve directed type pairs:** exercise all eleven supported conversions
   with target-specific data and an existing stop timeline for Unloading
   targets. Loading-to-Unloading must reject because Loading has no stop scope.
   Loading targets require newly entered Loading timestamps; cargo targets
   require a newly entered reason. No event-specific fields are inferred from
   similarly named source columns. Confirm full parent/stop/receipt snapshots,
   target identity, scope, and ledger row.
3. **Cargo-item snapshot policy:** source child rows are not moved into the
   different target item schema. Confirm every original child field (including
   Offload item `reason`) is recorded in `source_items_snapshot`, source child
   rows remain attached to the immutable source parent, and the target has no
   fabricated item rows. A conversion without source children records `[]`.
4. **Target conflicts:** a preexisting Loading for the trip or Unloading for
   the stop rejects. A preexisting Backload/Offload at the selected trip/stop
   scope rejects. Confirm no target merge or overwrite.
5. **Receipts:** compatible receipt rows retain their original IDs, paths, file
   names, MIME types, sizes, uploader, timestamps, and trip/stop scope. Exactly
   the source parent FK becomes null and exactly the target parent FK becomes
   the new target ID. For an Unloading target, receipt stop must equal the
   target stop. An incompatible receipt scope rejects with all data unchanged.
   Verify the guard checks OLD and NEW: detaching from a source already in the
   ledger rejects, while the RPC's atomic source-to-target handoff succeeds
   because its ledger row is inserted after receipt transfer.
6. **Repeated conversion:** repeat the same source conversion. The second call
   rejects on the unique source ledger key; exactly one target and ledger row
   exist, and receipt parents remain attached to that target.
7. **Rollback:** force a receipt trigger/FK/check failure after target creation
   is attempted. Verify the target insert, receipt update, and ledger insert
   all roll back.
8. **Concurrency:** run two concurrent calls for the same source and two calls
   targeting the same scope. At most one succeeds for a source/scope; the
   loser reports a conflict and leaves no partial target or receipt update.
9. **Immutability:** after conversion, UPDATE and DELETE of each source parent
   reject. New receipt attachment and child-item INSERT/UPDATE/DELETE reject.
   For an Unloading source, changes to stop ID/trip, sequence, store/customer,
   delivery status, unloading timeline, departure, remarks, and stop deletion
   reject; unrelated stop fields remain editable.
10. **Concurrency and lock order:** race receipt insertion against conversion,
    receipt updates against conversion, and source/item edits against conversion.
    Conversion locks currently attached receipt rows by ID, then the source
    parent, then performs a second receipt-row pass with `NOWAIT`; it then locks
    the source stop and snapshots cargo children without child-row locks.
    Ordinary receipt writes acquire the receipt row before the guard locks the
    NEW parent and the checked-in scope trigger takes that parent's advisory
    key. Confirm a conflicting receipt-row lock makes conversion return a
    retryable conflict rather than wait while holding the parent, no receipt-
    table-wide lock is taken, and all transaction changes roll back on failure.
    Also race a new receipt INSERT: if it waits on the source parent, it must
    reject after conversion commits because the converted-source guard now
    sees the source as immutable.

Run these only against an isolated database after reviewing and approving the
migration. Unit tests do not validate PostgreSQL trigger ordering, row locks,
NOWAIT behavior, RLS-bypass ownership, rollback, or concurrency.
