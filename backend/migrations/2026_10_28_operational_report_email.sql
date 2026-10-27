-- Private application mail queue. It never contains tokens or image binaries.
CREATE TABLE IF NOT EXISTS public.operational_email_settings(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT true,
 testing_recipient_email text,version bigint NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES public.profiles(id)
);
INSERT INTO public.operational_email_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.operational_email_recipients(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE CHECK(email=lower(btrim(email)) AND length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 enabled boolean NOT NULL DEFAULT true,report_types text[] NOT NULL CHECK(cardinality(report_types)>0 AND report_types <@ ARRAY['BACKLOAD','OFFLOAD','DEMURRAGE']::text[]),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.operational_email_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_type text NOT NULL CHECK(report_type IN ('BACKLOAD','OFFLOAD','DEMURRAGE','TEST')),
 report_id uuid NOT NULL,trip_id uuid,recipient_id uuid REFERENCES public.operational_email_recipients(id) ON DELETE SET NULL,recipient_email text NOT NULL,
 idempotency_key text NOT NULL UNIQUE,state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','SENT','FAILED','RETRY','BLOCKED','NEEDS_REVIEW','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0,last_error text,error_code text,provider_message_id text,provider_status text,
 created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,
 first_send_at timestamptz,ambiguous boolean NOT NULL DEFAULT false,
 content jsonb,attachment_manifest jsonb NOT NULL DEFAULT '[]',
 UNIQUE(report_type,report_id,recipient_email)
);
CREATE INDEX IF NOT EXISTS operational_email_due_idx ON public.operational_email_outbox(next_attempt_at) WHERE state IN ('PENDING','RETRY','PROCESSING');
CREATE INDEX IF NOT EXISTS operational_email_history_idx ON public.operational_email_outbox(created_at DESC);
ALTER TABLE public.operational_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_email_settings,public.operational_email_recipients,public.operational_email_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.operational_email_settings,public.operational_email_recipients,public.operational_email_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.save_operational_email_settings_v1(p_actor uuid,p_version bigint,p_enabled boolean,p_testing_email text,p_recipients jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; normalized text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='ADMIN' AND deactivated_at IS NULL) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';END IF;
 IF p_enabled IS NULL OR p_version IS NULL OR jsonb_typeof(p_recipients) IS DISTINCT FROM 'array' OR jsonb_array_length(p_recipients)>50 THEN RAISE EXCEPTION 'Invalid recipient settings' USING ERRCODE='22023';END IF;
 normalized:=nullif(lower(btrim(p_testing_email)),'');
 IF normalized IS NOT NULL AND (length(normalized)>254 OR normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid Resend account email' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.operational_email_settings WHERE id=true AND version=p_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Email settings changed. Reload before saving.' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT lower(btrim(value->>'email')) FROM jsonb_array_elements(p_recipients) GROUP BY lower(btrim(value->>'email')) HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate recipient email' USING ERRCODE='22023';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_recipients) LOOP
  IF jsonb_typeof(r->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(r->'report_types') IS DISTINCT FROM 'array' OR r->>'email' IS NULL THEN RAISE EXCEPTION 'Invalid recipient' USING ERRCODE='22023';END IF;
  INSERT INTO public.operational_email_recipients(email,enabled,report_types)
  VALUES(lower(btrim(r->>'email')),(r->>'enabled')::boolean,ARRAY(SELECT DISTINCT jsonb_array_elements_text(r->'report_types')))
  ON CONFLICT(email) DO UPDATE SET enabled=excluded.enabled,report_types=excluded.report_types;
 END LOOP;
 DELETE FROM public.operational_email_recipients WHERE email NOT IN(SELECT lower(btrim(value->>'email')) FROM jsonb_array_elements(p_recipients));
 UPDATE public.operational_email_settings SET enabled=p_enabled,testing_recipient_email=normalized,version=version+1,updated_at=now(),updated_by=p_actor WHERE id=true;
END $$;

CREATE OR REPLACE FUNCTION public.queue_operational_report_email_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE kind text:=TG_ARGV[0];
BEGIN
 IF NEW.status<>'SUBMITTED' THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_email_settings WHERE id=true AND enabled) THEN RETURN NEW;END IF;
 INSERT INTO public.operational_email_outbox(report_type,report_id,trip_id,recipient_id,recipient_email,idempotency_key)
 SELECT kind,NEW.id,NEW.trip_id,r.id,r.email,'operational/'||kind||'/'||NEW.id||'/'||md5(r.email)
 FROM public.operational_email_recipients r WHERE r.enabled AND kind=ANY(r.report_types)
 ON CONFLICT(report_type,report_id,recipient_email) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS operational_report_email ON public.backloads;
CREATE TRIGGER operational_report_email AFTER INSERT OR UPDATE OF status ON public.backloads FOR EACH ROW EXECUTE FUNCTION public.queue_operational_report_email_v1('BACKLOAD');
DROP TRIGGER IF EXISTS operational_report_email ON public.offloads;
CREATE TRIGGER operational_report_email AFTER INSERT OR UPDATE OF status ON public.offloads FOR EACH ROW EXECUTE FUNCTION public.queue_operational_report_email_v1('OFFLOAD');
DROP TRIGGER IF EXISTS operational_report_email ON public.demurrages;
CREATE TRIGGER operational_report_email AFTER INSERT OR UPDATE OF status ON public.demurrages FOR EACH ROW EXECUTE FUNCTION public.queue_operational_report_email_v1('DEMURRAGE');

CREATE OR REPLACE FUNCTION public.claim_operational_email_v1() RETURNS SETOF public.operational_email_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN QUERY WITH due AS(SELECT j.id FROM public.operational_email_outbox j
  WHERE (j.state IN ('PENDING','RETRY') OR j.state='PROCESSING' AND j.lease_until<now()) AND j.next_attempt_at<=now()
   AND (j.report_type='TEST' OR EXISTS(SELECT 1 FROM public.operational_email_settings WHERE id=true AND enabled))
  ORDER BY j.next_attempt_at,j.id FOR UPDATE SKIP LOCKED LIMIT 3)
 UPDATE public.operational_email_outbox j SET state='PROCESSING',attempts=attempts+1,lease_until=now()+interval '3 minutes',lease_token=gen_random_uuid()
 FROM due WHERE j.id=due.id RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.save_operational_email_settings_v1(uuid,bigint,boolean,text,jsonb),public.claim_operational_email_v1(),public.queue_operational_report_email_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_operational_email_settings_v1(uuid,bigint,boolean,text,jsonb),public.claim_operational_email_v1() TO service_role;

-- This bucket holds immutable send attachments for safe provider retries. Browser
-- clients have no policies. Delivery evidence stays in its existing buckets.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('operational-email-attachments','operational-email-attachments',false,12582912,ARRAY['application/pdf','image/png','image/jpeg','image/webp']) ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_confirmed_driver_event_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE dispatch text;driver_name text;plate text;stop_name text;title text;
BEGIN
 IF NEW.assignment_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.recorded_by AND role='TRUCKER' AND deactivated_at IS NULL) THEN RETURN NEW;END IF;
 SELECT t.dispatch_number,concat_ws(' ',d.first_name,d.last_name),tr.plate_number INTO dispatch,driver_name,plate
 FROM public.trips t JOIN public.trip_truck_assignments a ON a.trip_id=t.id LEFT JOIN public.drivers d ON d.id=a.driver_id LEFT JOIN public.trucks tr ON tr.id=a.truck_id WHERE a.id=NEW.assignment_id;
 SELECT coalesce(cs.name,s.delivery_location->>'name',s.delivery_location->>'label','Delivery stop '||s.stop_sequence) INTO stop_name FROM public.trip_stops s LEFT JOIN public.customer_stores cs ON cs.id=s.store_id WHERE s.id=NEW.trip_stop_id;
 title:=coalesce(nullif(NEW.delivery_metadata->>'title',''),initcap(replace(NEW.event_type,'_',' ')));
 INSERT INTO public.admin_notifications(recipient_profile_id,actor_profile_id,notification_type,reference_type,reference_id,trip_id,event_key,message,metadata,created_at)
 SELECT p.id,NEW.recorded_by,'report_mention','trip',NEW.trip_id,NEW.trip_id,NEW.id,
  concat_ws(' - ',dispatch,driver_name,plate,title,stop_name),jsonb_build_object('event_kind','driver_update','source','trip_events','source_id',NEW.id,'dispatch_number',dispatch,'driver_name',driver_name,'plate_number',plate,'event_type',NEW.event_type,'stop_id',NEW.trip_stop_id,'assignment_id',NEW.assignment_id),NEW.created_at
 FROM public.profiles p WHERE p.role IN ('ADMIN','STAFF') AND p.deactivated_at IS NULL
 ON CONFLICT(recipient_profile_id,event_key) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS confirmed_driver_notification ON public.trip_events;
CREATE TRIGGER confirmed_driver_notification AFTER INSERT ON public.trip_events FOR EACH ROW EXECUTE FUNCTION public.notify_confirmed_driver_event_v1();
REVOKE ALL ON FUNCTION public.notify_confirmed_driver_event_v1() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS admin_change_signal_trg ON public.operational_email_outbox;
CREATE TRIGGER admin_change_signal_trg AFTER INSERT OR UPDATE OR DELETE ON public.operational_email_outbox FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();
DROP TRIGGER IF EXISTS admin_change_signal_trg ON public.operational_email_settings;
CREATE TRIGGER admin_change_signal_trg AFTER UPDATE ON public.operational_email_settings FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_source_change();
