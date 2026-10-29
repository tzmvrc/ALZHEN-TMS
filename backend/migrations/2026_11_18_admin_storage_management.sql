-- A durable reservation bridges SQL reference checks and the supported Storage API.
CREATE TABLE IF NOT EXISTS public.storage_object_deletions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL,
 bucket_id text NOT NULL, object_name text NOT NULL, object_id uuid NOT NULL UNIQUE,
 requested_by uuid NOT NULL REFERENCES public.profiles(id), requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','DELETED')),
 deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS storage_deletion_path ON public.storage_object_deletions(bucket_id,object_name,state);
ALTER TABLE public.storage_object_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_object_deletions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.storage_object_deletions TO service_role;

CREATE OR REPLACE FUNCTION public.storage_admin_check_v1(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='ADMIN' AND deactivated_at IS NULL AND locked_at IS NULL) THEN RAISE EXCEPTION 'Admin storage access required.' USING ERRCODE='42501';END IF;END $$;

CREATE OR REPLACE FUNCTION public.storage_reference_text_v1(p_text text,p_path text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE decoded text:=coalesce(p_text,'');bytes bytea:=''::bytea;part text[];
BEGIN
 IF position(p_path IN decoded)>0 THEN RETURN true;END IF;
 IF decoded !~ '%[a-fA-F0-9]{2}' THEN RETURN false;END IF;
 -- Decode chunks, not one byte at a time; ordinary OCR/base64 text needs no decode.
 FOR part IN SELECT regexp_matches(decoded,'(%[a-fA-F0-9]{2}|[^%]+|%)','g') LOOP
 IF part[1] ~ '^%[a-fA-F0-9]{2}$' THEN bytes:=bytes||decode(substr(part[1],2),'hex');ELSE bytes:=bytes||convert_to(part[1],'UTF8');END IF;
 END LOOP;
 BEGIN decoded:=convert_from(bytes,'UTF8');EXCEPTION WHEN OTHERS THEN RETURN true;END;
 RETURN position(p_path IN decoded)>0;
END $$;
CREATE OR REPLACE FUNCTION public.storage_json_reference_v1(p_value jsonb,p_path text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE child jsonb;
BEGIN
 IF jsonb_typeof(p_value)='string' THEN RETURN public.storage_reference_text_v1(p_value#>>'{}',p_path);
 ELSIF jsonb_typeof(p_value)='array' THEN FOR child IN SELECT value FROM jsonb_array_elements(p_value) LOOP IF public.storage_json_reference_v1(child,p_path) THEN RETURN true;END IF;END LOOP;
 ELSIF jsonb_typeof(p_value)='object' THEN FOR child IN SELECT value FROM jsonb_each(p_value) LOOP IF public.storage_json_reference_v1(child,p_path) THEN RETURN true;END IF;END LOOP;END IF;
 RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.storage_reference_reason_v1(p_path text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE candidate record;found boolean;
BEGIN
 FOR candidate IN SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN pg_namespace n ON n.nspname=c.table_schema JOIN pg_class t ON t.relnamespace=n.oid AND t.relname=c.table_name
 WHERE c.table_schema='public' AND t.relkind IN ('r','p') AND c.table_name<>'storage_object_deletions'
 AND (c.data_type IN ('json','jsonb') OR (c.data_type IN ('text','character varying') AND c.column_name ~ '(path|url|link)')) ORDER BY CASE WHEN c.data_type IN ('json','jsonb') THEN 1 ELSE 0 END,c.table_name,c.column_name LOOP
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE CASE WHEN position($1 in r.%I::text)>0 OR position(substring(to_jsonb($1)::text from 2 for length(to_jsonb($1)::text)-2) in r.%I::text)>0 OR position(''%%'' in r.%I::text)>0 THEN public.storage_json_reference_v1(to_jsonb(r.%I),$1) ELSE false END%s)',candidate.table_name,candidate.column_name,candidate.column_name,candidate.column_name,candidate.column_name,CASE WHEN candidate.table_name='audit_logs' THEN ' AND r.action NOT LIKE ''STORAGE_OBJECT_%''' ELSE '' END) INTO found USING p_path;
 IF found THEN RETURN 'Protected reference in '||candidate.table_name;END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_storage_delete_v1(p_actor uuid,p_request uuid,p_bucket text,p_objects jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item jsonb;object storage.objects%ROWTYPE;job public.storage_object_deletions%ROWTYPE;reason text;result jsonb:='[]';
BEGIN
 PERFORM public.storage_admin_check_v1(p_actor);
 IF p_request IS NULL OR jsonb_typeof(p_objects)<>'array' OR jsonb_array_length(p_objects) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Select one to fifty objects.' USING ERRCODE='22023';END IF;
 -- Guards serialize insertion/update of references with reservation preparation.
 PERFORM pg_advisory_xact_lock(hashtextextended('storage-reference-reservations-v1',0));
 FOR item IN SELECT value FROM jsonb_array_elements(p_objects) ORDER BY value->>'id' LOOP
  SELECT * INTO job FROM public.storage_object_deletions WHERE object_id=(item->>'id')::uuid FOR UPDATE;
  IF FOUND AND job.state='DELETED' AND job.bucket_id=p_bucket AND job.object_name=item->>'name' THEN result:=result||to_jsonb(job);CONTINUE;END IF;
  SELECT * INTO object FROM storage.objects WHERE id=(item->>'id')::uuid AND bucket_id=p_bucket AND name=item->>'name' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Storage object changed. Refresh before deleting.' USING ERRCODE='P0409';END IF;
  IF job.id IS NOT NULL AND job.requested_by<>p_actor THEN RAISE EXCEPTION 'Another Admin is already deleting this object.' USING ERRCODE='P0409';END IF;
  reason:=public.storage_reference_reason_v1(object.name);
  IF reason IS NOT NULL THEN RAISE EXCEPTION 'Protected file: %. %',object.name,reason USING ERRCODE='23514';END IF;
  INSERT INTO public.storage_object_deletions(request_id,bucket_id,object_name,object_id,requested_by) VALUES(p_request,p_bucket,object.name,object.id,p_actor)
  ON CONFLICT(object_id) DO UPDATE SET request_id=storage_object_deletions.request_id RETURNING * INTO job;
  result:=result||to_jsonb(job);
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.guard_storage_reference_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job record;value jsonb;
BEGIN
 IF TG_TABLE_NAME='audit_logs' AND (to_jsonb(NEW)->>'action') LIKE 'STORAGE_OBJECT_%' THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('storage-reference-reservations-v1',0));
 value:=to_jsonb(NEW);
 FOR job IN SELECT d.* FROM public.storage_object_deletions d WHERE d.state='PENDING' OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=d.bucket_id AND o.name=d.object_name AND o.id<>d.object_id) LOOP
 IF public.storage_json_reference_v1(value,job.object_name) THEN RAISE EXCEPTION 'This file is reserved for deletion or no longer exists. Upload a new file.' USING ERRCODE='23514';END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $guards$
DECLARE candidate record;
BEGIN
 FOR candidate IN SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN pg_namespace n ON n.nspname=c.table_schema JOIN pg_class t ON t.relnamespace=n.oid AND t.relname=c.table_name
 WHERE c.table_schema='public' AND t.relkind='r' AND c.table_name<>'storage_object_deletions'
 AND (c.data_type IN ('json','jsonb') OR (c.data_type IN ('text','character varying') AND c.column_name ~ '(path|url|link)')) LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS admin_storage_reference_guard ON public.%I',candidate.table_name);
 EXECUTE format('CREATE TRIGGER admin_storage_reference_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_storage_reference_v1()',candidate.table_name);
 END LOOP;
END $guards$;

CREATE OR REPLACE FUNCTION public.guard_storage_object_delete_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.storage_object_deletions%ROWTYPE;
BEGIN
 IF TG_OP IN ('INSERT','UPDATE') THEN
 IF EXISTS(SELECT 1 FROM public.storage_object_deletions WHERE bucket_id=NEW.bucket_id AND object_name=NEW.name AND state='PENDING') THEN RAISE EXCEPTION 'Object reserved for deletion.' USING ERRCODE='55000';END IF;RETURN NEW;
 END IF;
 UPDATE public.storage_object_deletions SET state='DELETED',deleted_at=clock_timestamp() WHERE object_id=OLD.id AND state='PENDING' RETURNING * INTO job;
 IF FOUND THEN INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(job.requested_by,'STORAGE_OBJECT_DELETED','storage.objects',OLD.id,jsonb_build_object('bucket',OLD.bucket_id,'path',OLD.name,'metadata',OLD.metadata),jsonb_build_object('operation_id',job.id,'deleted_at',job.deleted_at));END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS admin_storage_object_guard ON storage.objects;
CREATE TRIGGER admin_storage_object_guard BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.guard_storage_object_delete_v1();
DROP TRIGGER IF EXISTS admin_storage_object_audit ON storage.objects;
CREATE TRIGGER admin_storage_object_audit AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.guard_storage_object_delete_v1();

CREATE OR REPLACE FUNCTION public.list_storage_objects_v1(p_actor uuid,p_bucket text,p_after text DEFAULT NULL,p_search text DEFAULT '',p_kind text DEFAULT 'ALL') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rows jsonb;count bigint;bytes numeric;
BEGIN
 PERFORM public.storage_admin_check_v1(p_actor);
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id=p_bucket) THEN RAISE EXCEPTION 'Bucket unavailable.' USING ERRCODE='P0002';END IF;
 SELECT count(*),coalesce(sum(CASE WHEN metadata->>'size' ~ '^\d+$' THEN (metadata->>'size')::numeric ELSE 0 END),0) INTO count,bytes FROM storage.objects WHERE bucket_id=p_bucket;
 SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]') INTO rows FROM (SELECT o.id,o.name,o.created_at,o.metadata->>'mimetype' mime_type,CASE WHEN o.metadata->>'size' ~ '^\d+$' THEN (o.metadata->>'size')::numeric ELSE NULL END size_bytes,
 (SELECT state FROM public.storage_object_deletions d WHERE d.object_id=o.id) deletion_state FROM storage.objects o WHERE bucket_id=p_bucket AND (p_after IS NULL OR o.name>p_after) AND (p_search='' OR o.name ILIKE '%'||p_search||'%') AND (p_kind='ALL' OR p_kind='IMAGE' AND o.metadata->>'mimetype' LIKE 'image/%' OR p_kind='DOCUMENT' AND coalesce(o.metadata->>'mimetype','') NOT LIKE 'image/%') ORDER BY o.name LIMIT 51)page;
 RETURN jsonb_build_object('rows',rows,'total',count,'size_bytes',bytes);
END $$;
CREATE OR REPLACE FUNCTION public.read_storage_object_v1(p_actor uuid,p_bucket text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN PERFORM public.storage_admin_check_v1(p_actor);SELECT jsonb_build_object('id',id,'name',name,'metadata',metadata) INTO result FROM storage.objects WHERE id=p_id AND bucket_id=p_bucket;RETURN result;END $$;
DO $permissions$
DECLARE fn regprocedure;
BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('storage_admin_check_v1','storage_reference_reason_v1','prepare_storage_delete_v1','list_storage_objects_v1','read_storage_object_v1') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);END LOOP;
END $permissions$;

-- Helpers join existing assignments; exclusive master-driver ownership is not their path.
DO $helper_guard$
DECLARE definition text;target regprocedure:=to_regprocedure('public.user_assign_current_truck_v1(uuid,uuid,uuid)');
BEGIN
 IF target IS NULL THEN RETURN;END IF;
 SELECT pg_get_functiondef('public.user_assign_current_truck_v1(uuid,uuid,uuid)'::regprocedure) INTO definition;
 IF position('HELPER_ASSIGNMENT_REQUIRED' IN definition)=0 THEN
 definition:=replace(definition,'IF d.assigned_truck_id IS NOT DISTINCT FROM p_truck THEN', $guard$IF EXISTS(SELECT 1 FROM public.profiles WHERE id=d.profile_id AND crew_role='HELPER') THEN RAISE EXCEPTION 'HELPER_ASSIGNMENT_REQUIRED: Choose an existing trip truck assignment.' USING ERRCODE='23514';END IF;
 IF d.assigned_truck_id IS NOT DISTINCT FROM p_truck THEN$guard$);
 EXECUTE definition;
 END IF;
END $helper_guard$;
NOTIFY pgrst,'reload schema';
