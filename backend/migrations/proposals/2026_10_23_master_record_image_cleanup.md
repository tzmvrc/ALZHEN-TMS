Applied to the existing ALZHEN Supabase project as migration
`20261022185852 master_record_image_cleanup`, with full user approval.
The SQL remains at its original proposal path to preserve the requested reference.

The current `delete_master_data_record_v1` explicitly rejects product photos and
protects truck gallery rows as dependencies. Removing files before invoking that
RPC would destroy images even when operational dependencies reject deletion.
Removing files only after deletion without a journal would lose retry information
if Storage or the backend failed.

The accompanying SQL adds:

- A private, service-role-only `master_image_cleanup_jobs` table, with one durable
  operation per product/truck, leased attempts, backoff, and exact Storage receipts.
- `delete_master_data_with_images_v1`, which snapshots exclusively owned,
  registered images, detaches image metadata, invokes the existing guarded deletion
  RPC, and writes the journal and attachment audit in the same transaction.
  Any dependency, permission, FK, trigger, or audit failure rolls everything back.
- Claim/validation RPCs for the backend worker. Validation checks current
  references, bucket, canonical owner folder, object UUID, metadata fingerprint,
  and Storage version. Missing objects are safe to acknowledge on retry; replaced
  objects or new references block cleanup and retain the journal for review.
- Reference triggers preventing records from attaching journaled deletion paths.

No bucket, operational foreign key, historical trip, or existing business record
is changed by applying the migration itself. Only the existing `product-photos`
and `truck-images` buckets are used. Existing shared or foreign paths are retained.

The migration is installed and the PostgREST schema cache has been refreshed.
No additional schema activation or bucket changes are needed. Other Database
sheets retain the existing deletion RPC. Product/truck deletion fails closed if
the image-aware RPC is ever unavailable.
The backend performs immediate cleanup after confirmed deletion, then retries
pending work every 15 seconds with per-job backoff. Storage success is checked
again before marking an operation complete. Both single and bulk deletion report
committed deletion separately from pending cleanup.

ADMIN/STAFF recovery endpoints (under the existing authenticated master-data router):

- `GET /api/master-data/image-cleanup/pending`
- `POST /api/master-data/image-cleanup/:operationId/retry`

Live schema inspection confirmed the existing tables, image path conventions,
Storage buckets, operational FKs, and guarded deletion RPC before application.
After application, metadata inspection confirmed the migration version, private
queue with RLS enabled, service-only RPC permissions, and reference triggers. No
business records or Storage images were deleted for verification; the queue had
zero pending operations. No tests, builds, compilation, or browser verification
were run. Runtime deletion and retry behavior has been reviewed in source only.

The worker starts automatically with the existing backend server entry point. A
backend process that predates these code changes must restart to load them (the
local development watcher normally reloads changed source). No server startup,
restart, build, commit, push, or deployment was performed as part of this change.
Do not remove the journal table during a rollback while cleanup jobs remain
pending. Retain the worker or export and recover those operations first.
