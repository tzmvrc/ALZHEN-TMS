-- Keep every intentionally selected page in one submission, retaining cross-submission deduplication.
CREATE FUNCTION public.guard_pod_content_submission_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.kind IS DISTINCT FROM 'receipt' OR NEW.file_sha256 IS NULL THEN RETURN NEW;END IF;
 PERFORM 1 FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.trip_images prior_page WHERE prior_page.id<>NEW.id AND prior_page.trip_id=NEW.trip_id AND prior_page.trip_stop_id IS NOT DISTINCT FROM NEW.trip_stop_id AND prior_page.kind='receipt' AND prior_page.file_sha256=NEW.file_sha256 AND coalesce(prior_page.delivery_event_id,prior_page.id) IS DISTINCT FROM coalesce(NEW.delivery_event_id,NEW.id)) THEN
  RAISE EXCEPTION 'trip_receipt_content_once_idx: This image belongs to another saved POD submission.' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pod_content_submission_v1() FROM PUBLIC,anon,authenticated;
DROP INDEX public.trip_receipt_content_once_idx;
CREATE INDEX trip_receipt_content_lookup_idx ON public.trip_images(trip_id,trip_stop_id,file_sha256) WHERE kind='receipt' AND file_sha256 IS NOT NULL;
CREATE TRIGGER pod_content_submission_guard BEFORE INSERT OR UPDATE OF kind,file_sha256,delivery_event_id,trip_id,trip_stop_id ON public.trip_images FOR EACH ROW EXECUTE FUNCTION public.guard_pod_content_submission_v1();
