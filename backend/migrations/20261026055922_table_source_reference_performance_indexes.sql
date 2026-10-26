-- Applied to hdmknewarynwpbrhfgai via the approved Supabase migration API.
-- Additive source-reference indexes only; no row or permission changes.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
CREATE INDEX IF NOT EXISTS performance_line_items_source_warehouse_idx ON public.trip_line_items(source_warehouse_id);
CREATE INDEX IF NOT EXISTS performance_offload_items_source_line_idx ON public.offload_items(trip_line_item_id);
CREATE INDEX IF NOT EXISTS performance_backload_items_source_line_idx ON public.backload_items(trip_line_item_id);
