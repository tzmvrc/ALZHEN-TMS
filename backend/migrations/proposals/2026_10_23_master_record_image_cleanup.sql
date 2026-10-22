-- Applied to the existing ALZHEN Supabase project.
-- Migration: 20261022185852 master_record_image_cleanup (user-authorized).
-- Requires the existing delete_master_data_record_v1 and product/truck image tables.
-- Adds an atomic deletion/cleanup journal; does not alter any operational FK.
BEGIN;
SET LOCAL lock_timeout='3s';

CREATE TABLE public.master_image_cleanup_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 resource text NOT NULL CHECK(resource IN ('products','trucks')),
 record_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 storage_objects jsonb NOT NULL CHECK(jsonb_typeof(storage_objects)='array'),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','RUNNING','COMPLETE')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(resource,record_id)
);
CREATE INDEX master_image_cleanup_pending ON public.master_image_cleanup_jobs(next_attempt_at) WHERE state<>'COMPLETE';
CREATE INDEX master_image_cleanup_objects ON public.master_image_cleanup_jobs USING gin(storage_objects jsonb_path_ops);
ALTER TABLE public.master_image_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_image_cleanup_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.master_image_cleanup_jobs TO service_role;

-- Canonical upload paths are UUIDs and are never intentionally reused. Prevent
-- another record from attaching a path once its deletion has been journaled.
CREATE FUNCTION public.protect_master_cleanup_image_reference_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE path text; bucket text;
BEGIN
 path:=CASE TG_TABLE_NAME WHEN 'products' THEN to_jsonb(NEW)->>'photo_path' ELSE to_jsonb(NEW)->>'storage_path' END;
 bucket:=CASE TG_TABLE_NAME WHEN 'products' THEN 'product-photos' ELSE 'truck-images' END;
 IF path IS NOT NULL AND EXISTS(SELECT 1 FROM public.master_image_cleanup_jobs
  WHERE storage_objects @> jsonb_build_array(jsonb_build_object('bucket',bucket,'path',path))) THEN
  RAISE EXCEPTION 'This image belongs to a deleted record; upload a new image' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $function$;
CREATE TRIGGER products_protect_cleanup_image BEFORE INSERT OR UPDATE OF photo_path ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.protect_master_cleanup_image_reference_v1();
CREATE TRIGGER trucks_protect_cleanup_image BEFORE INSERT OR UPDATE OF storage_path ON public.truck_images
 FOR EACH ROW EXECUTE FUNCTION public.protect_master_cleanup_image_reference_v1();
REVOKE ALL ON FUNCTION public.protect_master_cleanup_image_reference_v1() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.delete_master_data_with_images_v1(p_resource text,p_id uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE before_row jsonb; images jsonb := '[]'::jsonb; manifest jsonb := '[]'::jsonb;
 result jsonb; job public.master_image_cleanup_jobs; fk record; child_key text; dependent boolean;
BEGIN
 PERFORM set_config('lock_timeout','3s',true);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF') AND deactivated_at IS NULL) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_resource NOT IN ('products','trucks') THEN
  RETURN public.delete_master_data_record_v1(p_resource,p_id,p_actor);
 END IF;
 -- Freeze attachment/reference mutations while taking the manifest and deleting.
 -- Storage is touched only AFTER this transaction successfully commits.
 LOCK TABLE public.products,public.truck_images IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO job FROM public.master_image_cleanup_jobs WHERE resource=p_resource AND record_id=p_id;
 IF FOUND THEN
  IF (p_resource='products' AND EXISTS(SELECT 1 FROM public.products WHERE id=p_id)) OR
     (p_resource='trucks' AND EXISTS(SELECT 1 FROM public.trucks WHERE id=p_id)) THEN
   RAISE EXCEPTION 'Record identity was reused; review before deletion' USING ERRCODE='55000'; END IF;
  RETURN jsonb_build_object('id',p_id,'resource',p_resource,'deleted',true,'operation_id',job.id,'cleanup_pending',job.state<>'COMPLETE');
 END IF;
 IF p_resource='products' THEN
  SELECT to_jsonb(p) INTO before_row FROM public.products p WHERE id=p_id FOR UPDATE;
 ELSE
  SELECT to_jsonb(t) INTO before_row FROM public.trucks t WHERE id=p_id FOR UPDATE;
 END IF;
 IF before_row IS NULL THEN RAISE EXCEPTION 'Record not found' USING ERRCODE='P0002'; END IF;

 IF p_resource='products' THEN
  -- Foreign/unowned/shared paths remain untouched. Only a registered, exclusive
  -- photo in this product's canonical folder can enter the cleanup manifest.
  SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'object_id',o.id,
   'metadata_hash',md5(coalesce(o.metadata::text,'')),'object_version',to_jsonb(o)->>'version')),'[]'::jsonb)
  INTO manifest FROM storage.objects o
  WHERE o.bucket_id='product-photos' AND o.name=before_row->>'photo_path'
   AND o.name ~ ('^products/'||p_id::text||'/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$')
   AND NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id<>p_id AND p.photo_path=o.name);
  UPDATE public.products SET photo_path=NULL WHERE id=p_id;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) INTO images FROM public.truck_images i WHERE i.truck_id=p_id;
  -- Do not let deleting gallery metadata cascade into any referencing records.
  FOR fk IN SELECT * FROM pg_constraint WHERE contype='f' AND confrelid='public.truck_images'::regclass LOOP
   IF cardinality(fk.conkey)<>1 OR cardinality(fk.confkey)<>1 OR fk.confkey[1]<>(SELECT attnum FROM pg_attribute WHERE attrelid='public.truck_images'::regclass AND attname='id' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Unreviewed image relationship prevents deletion' USING ERRCODE='55000'; END IF;
   SELECT attname INTO STRICT child_key FROM pg_attribute WHERE attrelid=fk.conrelid AND attnum=fk.conkey[1];
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s c JOIN public.truck_images i ON c.%I=i.id WHERE i.truck_id=$1)',fk.conrelid::regclass,child_key) INTO dependent USING p_id;
   IF dependent THEN RAISE EXCEPTION 'Referenced gallery image prevents deletion' USING ERRCODE='55000'; END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'object_id',o.id,
   'metadata_hash',md5(coalesce(o.metadata::text,'')),'object_version',to_jsonb(o)->>'version')),'[]'::jsonb)
  INTO manifest FROM storage.objects o WHERE o.bucket_id='truck-images'
   AND EXISTS(SELECT 1 FROM public.truck_images i WHERE i.truck_id=p_id AND i.storage_path=o.name)
   AND o.name ~ ('^trucks/'||p_id::text||'/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$')
   AND NOT EXISTS(SELECT 1 FROM public.truck_images i WHERE i.truck_id<>p_id AND i.storage_path=o.name);
  DELETE FROM public.truck_images WHERE truck_id=p_id;
 END IF;
 INSERT INTO public.master_image_cleanup_jobs(resource,record_id,actor_id,storage_objects,state,completed_at)
 VALUES(p_resource,p_id,p_actor,manifest,CASE WHEN jsonb_array_length(manifest)=0 THEN 'COMPLETE' ELSE 'PENDING' END,
  CASE WHEN jsonb_array_length(manifest)=0 THEN now() ELSE NULL END) RETURNING * INTO job;
 -- Delegate all operational dependency checks, audit and the parent DELETE to
 -- the EXISTING guarded RPC. Any rejection rolls back metadata AND the journal.
 result:=public.delete_master_data_record_v1(p_resource,p_id,p_actor);
 IF result->>'deleted' IS DISTINCT FROM 'true' OR result->>'id' IS DISTINCT FROM p_id::text THEN
  RAISE EXCEPTION 'Deletion was not confirmed' USING ERRCODE='55000'; END IF;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
 VALUES(p_actor,'QUEUE_MASTER_IMAGE_CLEANUP',p_resource,p_id,
  jsonb_build_object('record',before_row,'truck_images',images),jsonb_build_object('operation_id',job.id,'storage_objects',manifest));
 RETURN result||jsonb_build_object('operation_id',job.id,'cleanup_pending',job.state<>'COMPLETE');
END $function$;

CREATE FUNCTION public.claim_master_image_cleanup_v1(p_operation uuid DEFAULT NULL)
RETURNS SETOF public.master_image_cleanup_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 RETURN QUERY WITH candidates AS (
  SELECT id FROM public.master_image_cleanup_jobs
  WHERE (p_operation IS NULL OR id=p_operation) AND
   ((state='PENDING' AND (p_operation IS NOT NULL OR next_attempt_at<=now())) OR (state='RUNNING' AND lease_until<now()))
  ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED
 ) UPDATE public.master_image_cleanup_jobs j SET state='RUNNING',attempts=j.attempts+1,lease_until=now()+interval '10 minutes'
 FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $function$;

CREATE FUNCTION public.validate_master_image_cleanup_v1(p_operation uuid,p_attempt integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE job public.master_image_cleanup_jobs; receipt jsonb; obj record; valid jsonb := '[]'::jsonb; prefix text; bucket text;
BEGIN
 PERFORM set_config('lock_timeout','3s',true);
 LOCK TABLE public.products,public.truck_images IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO job FROM public.master_image_cleanup_jobs WHERE id=p_operation AND attempts=p_attempt AND state='RUNNING' AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cleanup lease is no longer valid' USING ERRCODE='55000'; END IF;
 IF (job.resource='products' AND EXISTS(SELECT 1 FROM public.products WHERE id=job.record_id)) OR
    (job.resource='trucks' AND EXISTS(SELECT 1 FROM public.trucks WHERE id=job.record_id)) THEN
  RAISE EXCEPTION 'Record identity was reused; preserve its files' USING ERRCODE='55000'; END IF;
 prefix:=CASE job.resource WHEN 'products' THEN 'products/' ELSE 'trucks/' END||job.record_id::text||'/';
 bucket:=CASE job.resource WHEN 'products' THEN 'product-photos' ELSE 'truck-images' END;
 FOR receipt IN SELECT value FROM jsonb_array_elements(job.storage_objects) LOOP
  IF receipt->>'bucket' IS DISTINCT FROM bucket OR receipt->>'path' IS NULL OR receipt->>'path' !~ ('^'||prefix||'[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$') THEN
   RAISE EXCEPTION 'Unverified image ownership' USING ERRCODE='55000'; END IF;
  IF (bucket='product-photos' AND EXISTS(SELECT 1 FROM public.products WHERE photo_path=receipt->>'path')) OR
     (bucket='truck-images' AND EXISTS(SELECT 1 FROM public.truck_images WHERE storage_path=receipt->>'path')) THEN
   RAISE EXCEPTION 'Image is referenced; preserve it for review' USING ERRCODE='55000'; END IF;
  SELECT o.id,md5(coalesce(o.metadata::text,'')) AS metadata_hash,to_jsonb(o)->>'version' AS object_version INTO obj
   FROM storage.objects o WHERE o.bucket_id=bucket AND o.name=receipt->>'path';
  IF NOT FOUND THEN CONTINUE; END IF; -- already removed in an earlier attempt
  IF obj.id::text IS DISTINCT FROM receipt->>'object_id' OR obj.metadata_hash IS DISTINCT FROM receipt->>'metadata_hash' OR obj.object_version IS DISTINCT FROM receipt->>'object_version' THEN
   RAISE EXCEPTION 'Storage object was replaced; preserve it for review' USING ERRCODE='55000'; END IF;
  valid:=valid||jsonb_build_array(receipt);
 END LOOP;
 RETURN valid;
END $function$;

REVOKE ALL ON FUNCTION public.delete_master_data_with_images_v1(text,uuid,uuid),public.claim_master_image_cleanup_v1(uuid),public.validate_master_image_cleanup_v1(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_master_data_with_images_v1(text,uuid,uuid),public.claim_master_image_cleanup_v1(uuid),public.validate_master_image_cleanup_v1(uuid,integer) TO service_role;
COMMIT;
