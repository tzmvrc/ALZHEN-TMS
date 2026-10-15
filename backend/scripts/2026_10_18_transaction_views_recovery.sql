-- Recovery plan (read-only): roll application code back while retaining additive
-- columns and appended view outputs. Existing view prefixes are unchanged, so
-- the previous application remains compatible. No operational records are altered.
-- CREATE OR REPLACE VIEW cannot remove appended columns; do not attempt that as
-- an automatic down migration. Original definitions/types are in the JSON snapshot.
-- Recover values directly from the retained stop columns if application recovery
-- is needed. Any future column removal requires a separate reviewed migration.
SELECT id,trip_id,dr_number,quantity,total_cbm,archived_at,archived_by
FROM public.trip_stops ORDER BY id;
SELECT id,archived_at,archived_by FROM public.trips ORDER BY id;

