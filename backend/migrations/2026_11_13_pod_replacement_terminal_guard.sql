-- A domain conflict is not a PostgreSQL serialization failure. Hasql/PostgREST
-- retries 40001 transactions, so a stale replacement reference can occupy the
-- entire REST pool indefinitely. No documents, decisions or cargo are changed.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.submit_pod_replacement_v1(uuid,uuid,uuid,jsonb)'::regprocedure);
 IF position('USING ERRCODE=''40001''' IN definition)=0 AND position('USING ERRCODE=''P0409''' IN definition)=0 THEN
  RAISE EXCEPTION 'Replacement guard differs from the inspected definition';
 END IF;
 definition:=replace(definition,'USING ERRCODE=''40001''','USING ERRCODE=''P0409''');
 EXECUTE definition;
END $migration$;
ALTER FUNCTION public.submit_pod_replacement_v1(uuid,uuid,uuid,jsonb) SET lock_timeout='3s';
ALTER FUNCTION public.submit_pod_replacement_v1(uuid,uuid,uuid,jsonb) SET statement_timeout='20s';
NOTIFY pgrst,'reload schema';
COMMIT;
