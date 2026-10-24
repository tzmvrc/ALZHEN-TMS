# CSV save deployment prerequisites

## Deployment verified — 2026-10-24

The approved proposal was applied unchanged through the Supabase integration to project `hdmknewarynwpbrhfgai` (`ALZHEN TMS DATABASE`, `ACTIVE_HEALTHY`). Migration history records version `20261024014613`, name `source_csv_save_prerequisites`. This supersedes the earlier access limitation and unapplied status recorded below.

Post-deployment verification confirmed:

- Both source RPCs exist with signature `(uuid,uuid,text,jsonb,jsonb,boolean,jsonb)`, return `jsonb`, and have fixed `search_path=public,pg_temp`. Execution is granted to `service_role` and denied to `PUBLIC`, `anon`, and `authenticated`.
- `trip_stops.delivery_location` is nullable `jsonb` with no default. A read-only PostgREST column query returned HTTP 200, and both RPCs appear in its OpenAPI schema after the schema reload.
- Every previously installed public function retains its pre-deployment definition hash. Full-row checksums of import rows, batches, and groups are unchanged.
- Trips, stops, and line items remain at zero. Import history counts remain 93 rows, 34 batches, and 3 groups. No importer RPC was invoked, and no trip records were created or imported.
- Security advisor findings are unchanged from the pre-deployment check; neither new function introduced an advisory finding.

Read-only inspection of the connected database on 2026-10-24 found:

| Capability | Installed |
| --- | --- |
| `import_trip_source_rows_v2` | Yes |
| `import_trip_source_rows_v3` | No |
| `import_trip_source_rows_with_details_v1` | No |
| `import_trip_master_rows_with_details_v1` | No |
| `trip_stops.delivery_location` | No |

The two HTTP requests are expected: the frontend first tries the reviewed trip-only coordinates, then retries without pins only for the specific no-write `TRIP_DELIVERY_LOCATION_SETUP_REQUIRED` response. That retry still needs the appropriate import RPC. Historical-product recovery uses v3; populated trip details use the source-with-details RPC. Neither function is currently installed. Repeatedly refreshing the UI cannot install them.

## Prepared change, not applied

`backend/migrations/proposals/2026_10_24_proposed_source_csv_save_prerequisites.sql` consolidates only the prerequisites for the source CSV flow:

- Add nullable `trip_stops.delivery_location`.
- Add `import_trip_source_rows_v3` from the previously prepared recovery proposal.
- Add `import_trip_source_rows_with_details_v1` from the previously prepared details proposal.
- Grant execution only to the backend service role and reload the PostgREST schema cache.

This leaves the existing importer, cargo allocator, policies, triggers and operational records intact. It does not create trips or recover products merely by being applied. The migration is transactional; `CREATE FUNCTION` intentionally fails if either function was installed since inspection, rather than overwriting an unknown definition. It checks the source/workflow prerequisites first. It does not enable operational Master List imports, which require their own separately reviewed schema.

The file starts with: **“PREPARED ONLY. Requires explicit approval before application to the connected database.”** The user approved this exact migration on 2026-10-24 with “yes apply”. That approval remains valid; no second migration approval is needed. Deployment has not occurred because this session has application REST credentials only, no SQL-capable Supabase connection, PostgreSQL credentials, or management login. A read-only recheck still found both functions and the stop snapshot column absent. Supabase integration discovery found an available, uninstalled Supabase integration; installation and account connection are the remaining access step. No live writes were attempted.

## Validation completed

`backend/tests/csv-save-prerequisites.test.ts` installs the proposal into an isolated in-memory PostgreSQL database using the existing source schema and resolver. Both the synthetic fixture and the actual Cebu CSV passed. The actual file retains 56 lines with exact quantities and CBM; schedule/origin/remarks are stored; retries skip live rows; missing-line recovery requires approval and preserves an edited live sibling. Both new RPCs execute, service-only permissions hold, and a trip snapshot can be saved without changing store coordinates. No live database client is imported by this test.

The browser suite also verifies that the modal displays the specific trip-details setup message, rather than replacing it with the generic administrator-update message. Its API calls are mocked.

## After an approved deployment

1. Verify both source RPC signatures and the stop column exist.
2. Verify the PostgREST schema reload is visible. Missing-column capability checks retry after five seconds; restarting the backend is optional if its deployment process already reloads it.
3. Reopen the existing import batch, retain the explicit recovery approvals, and retry Save. Use the same source identities and batch to preserve idempotency.
4. Check actual commit results before claiming success. Unrelated store/product identity issues, schedule conflicts or operational Master List prerequisites are not bypassed by this migration.
