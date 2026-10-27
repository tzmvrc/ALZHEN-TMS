-- The retry journal gained lease and schedule columns after its original
-- column-level service_role UPDATE grant. Permit only the cleanup service's
-- journal acknowledgements; retain RLS and all existing ownership checks.
GRANT UPDATE (cleanup_lease_until, next_attempt_at)
  ON public.transaction_deletion_jobs TO service_role;
