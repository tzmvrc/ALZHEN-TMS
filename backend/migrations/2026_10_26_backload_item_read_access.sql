-- Match the existing backend-only read access on offload_items.
-- No client grants, write grants, or RLS changes.
grant select on table public.backload_items to service_role;
