-- Delivery Companion stores READY images at
-- trips/<trip>/delivery/<uploader>/<upload_key>, without an extension.
-- Recognize only that exact owned path alongside the reviewed legacy path.
-- The existing Storage object ID/fingerprint and retained-reference checks
-- still run before any relation or object is deleted.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $migration$
DECLARE
  definition text;
  old_check constant text := $old$substring(v_image.storage_path from length(v_prefix)+1) !~ '^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$'$old$;
  new_check constant text := $new$NOT (
        substring(v_image.storage_path from length(v_prefix)+1) ~ '^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$'
        OR (
          v_image.delivery_upload_state='READY'
          AND v_image.uploaded_by IS NOT NULL
          AND v_image.delivery_upload_key IS NOT NULL
          AND v_image.storage_path=v_prefix||'delivery/'||v_image.uploaded_by::text||'/'||v_image.delivery_upload_key::text
        )
      )$new$;
BEGIN
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),chr(13),''))
      <> '19185155b0d3da9ac0ebc39b747175e4' THEN
    RAISE EXCEPTION 'Transaction deletion changed; review image ownership before installation.';
  END IF;
  definition:=replace(pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),E'\r\n',E'\n');
  IF position(old_check in definition)=0 THEN
    RAISE EXCEPTION 'Expected legacy image path check not found.';
  END IF;
  definition:=replace(definition,old_check,new_check);
  EXECUTE definition;
  IF has_function_privilege('anon','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected transaction deletion permissions; installation rolled back.';
  END IF;
END $migration$;

COMMIT;
