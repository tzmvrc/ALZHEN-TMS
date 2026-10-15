-- Additive Offload details. Existing report dates, creators, receipts and items
-- remain untouched. Old rows keep NULL new fields and use application fallbacks.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.offloads
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
-- Set the default separately so historical rows are not stamped as new reports.
ALTER TABLE public.offloads ALTER COLUMN reported_at SET DEFAULT now();

-- Service-only, invoker-rights transaction for parent + optional independent
-- item. Authorization and reporter validation remain in the backend service.
CREATE OR REPLACE FUNCTION public.create_offload_with_item_v1(p_report jsonb, p_item jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $body$
DECLARE saved public.offloads; stop_record public.trip_stops; trip_record public.trips;
BEGIN
  SELECT * INTO trip_record FROM public.trips WHERE id=(p_report->>'trip_id')::uuid FOR SHARE;
  IF NOT FOUND OR trip_record.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Trip is unavailable or archived'; END IF;
  IF p_report->>'trip_stop_id' IS NOT NULL THEN
    SELECT * INTO stop_record FROM public.trip_stops WHERE id=(p_report->>'trip_stop_id')::uuid AND trip_id=trip_record.id FOR SHARE;
    IF NOT FOUND OR stop_record.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Transaction is unavailable or archived'; END IF;
  END IF;
  INSERT INTO public.offloads(trip_id,trip_stop_id,reason,number_of_boxes,comments,created_by,submitted_by,submitted_at,reported_at,reported_by,report_date)
  VALUES(trip_record.id,(p_report->>'trip_stop_id')::uuid,p_report->>'reason',(p_report->>'number_of_boxes')::numeric,p_report->>'comments',
    (p_report->>'created_by')::uuid,(p_report->>'submitted_by')::uuid,(p_report->>'submitted_at')::timestamptz,
    (p_report->>'reported_at')::timestamptz,(p_report->>'reported_by')::uuid,((p_report->>'reported_at')::timestamptz AT TIME ZONE 'Asia/Manila')::date)
  RETURNING * INTO saved;
  IF p_item->>'quantity' IS NOT NULL OR p_item->>'total_cbm' IS NOT NULL THEN
    IF (p_item->>'quantity')::numeric < 0 OR (p_item->>'total_cbm')::numeric < 0
       OR COALESCE(p_item->>'quantity','') IN ('NaN','Infinity','-Infinity') OR COALESCE(p_item->>'total_cbm','') IN ('NaN','Infinity','-Infinity')
    THEN RAISE EXCEPTION 'Offload values must be finite and non-negative'; END IF;
    INSERT INTO public.offload_items(offload_id,trip_line_item_id,quantity,total_cbm)
    VALUES(saved.id,NULL,(p_item->>'quantity')::numeric,(p_item->>'total_cbm')::numeric);
  END IF;
  RETURN to_jsonb(saved);
END;
$body$;
REVOKE ALL ON FUNCTION public.create_offload_with_item_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_offload_with_item_v1(jsonb,jsonb) TO service_role;

-- Serialize capacity checks per Offload; preserve all historical attachments.
CREATE OR REPLACE FUNCTION public.check_offload_receipt_capacity_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $body$
BEGIN
  IF NEW.offload_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.offload_id IS NOT DISTINCT FROM NEW.offload_id THEN RETURN NEW; END IF;
  PERFORM id FROM public.offloads WHERE id=NEW.offload_id FOR UPDATE;
  IF (SELECT count(*) FROM public.report_receipts WHERE offload_id=NEW.offload_id AND id<>NEW.id)>=5 THEN
    RAISE EXCEPTION 'An Offload supports at most five images' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$body$;
DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.report_receipts'::regclass AND tgname='offload_receipt_capacity_trg') THEN
    CREATE TRIGGER offload_receipt_capacity_trg BEFORE INSERT OR UPDATE OF offload_id ON public.report_receipts
    FOR EACH ROW EXECUTE FUNCTION public.check_offload_receipt_capacity_v1();
  END IF;
END;
$trigger$;
COMMIT;
