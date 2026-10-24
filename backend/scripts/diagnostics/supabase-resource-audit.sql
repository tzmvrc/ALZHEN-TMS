-- READ-ONLY. Run occasionally, not on a frequent production polling loop.
-- Never reset statistics: compare timestamped deltas from the same stats epoch.
SELECT now() AS sampled_at, pg_postmaster_start_time() AS postmaster_started_at,
  pg_database_size(current_database()) AS database_bytes;

SELECT backend_type, usename, application_name, state, wait_event_type, wait_event,
  count(*) AS connections, max(now()-xact_start) AS oldest_transaction
FROM pg_stat_activity GROUP BY 1,2,3,4,5,6 ORDER BY connections DESC;

SELECT numbackends, xact_commit, xact_rollback, blks_read, blks_hit,
  temp_files, temp_bytes, deadlocks, stats_reset
FROM pg_stat_database WHERE datname=current_database();

SELECT stats_reset FROM extensions.pg_stat_statements_info;
SELECT queryid, calls, round(total_exec_time::numeric,2) AS total_ms,
  round(mean_exec_time::numeric,2) AS mean_ms, shared_blks_read,
  shared_blks_hit, temp_blks_written, wal_bytes,
  CASE WHEN query ILIKE '%claim_user_maintenance_v1%' THEN 'user maintenance claim'
       WHEN query ILIKE '%claim_master_image_cleanup_v1%' THEN 'master image claim'
       WHEN query ILIKE '%planned_route_context_v1%' THEN 'planned route context'
       WHEN query ILIKE '%realtime.list_changes%' THEN 'Realtime WAL delivery'
       WHEN query ILIKE '%v_trip_master_csv%' THEN 'Master List projection'
       ELSE 'other (inspect privately if needed)' END AS resource
FROM extensions.pg_stat_statements
WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
  AND query NOT ILIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC LIMIT 25;

SELECT state,count(*) AS jobs,max(attempts) AS max_attempts,
  min(next_attempt_at) FILTER (WHERE state<>'DONE') AS next_unfinished_attempt
FROM public.user_maintenance_jobs GROUP BY state;
SELECT state,count(*) AS jobs,max(attempts) AS max_attempts,
  min(next_attempt_at) FILTER (WHERE state<>'COMPLETE') AS next_unfinished_attempt
FROM public.master_image_cleanup_jobs GROUP BY state;

SELECT schemaname,indexname,indexdef FROM pg_indexes
WHERE tablename IN ('user_maintenance_jobs','master_image_cleanup_jobs');
SELECT slot_name,active,wal_status,
  pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn) AS retained_wal_bytes
FROM pg_replication_slots;
SELECT to_regclass('cron.job') AS cron_jobs,
  to_regclass('cron.job_run_details') AS cron_run_history;
