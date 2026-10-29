CREATE TABLE public.recognized_login_devices(profile_id uuid REFERENCES public.profiles(id),device_hash text,first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(profile_id,device_hash));
CREATE TABLE public.login_security_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES public.profiles(id),device_hash text NOT NULL,session_hash text NOT NULL,recipient text NOT NULL,metadata jsonb NOT NULL,login_at timestamptz NOT NULL DEFAULT now(),state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','SENT','RETRY','NEEDS_REVIEW','FAILED')),attempts int NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,error_code text,sent_at timestamptz,UNIQUE(profile_id,device_hash));
INSERT INTO public.recognized_login_devices(profile_id,device_hash,first_seen_at,last_seen_at) SELECT profile_id,encode(sha256(convert_to(device_identifier::text,'UTF8')),'hex'),min(created_at),max(last_activity_at) FROM public.device_sessions WHERE device_identifier IS NOT NULL GROUP BY profile_id,device_identifier ON CONFLICT DO NOTHING;
ALTER TABLE public.recognized_login_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_security_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recognized_login_devices,public.login_security_notifications FROM anon,authenticated;
GRANT ALL ON public.recognized_login_devices,public.login_security_notifications TO service_role;
CREATE INDEX login_security_due ON public.login_security_notifications(next_attempt_at) WHERE state IN ('PENDING','RETRY');
CREATE FUNCTION public.queue_login_security_v1(p_profile uuid,p_device text,p_session text,p_recipient text,p_metadata jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE inserted boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.device_sessions WHERE profile_id=p_profile AND session_hash=p_session AND status='ACTIVE') THEN RAISE EXCEPTION 'Verified session required' USING ERRCODE='42501';END IF;
 INSERT INTO public.recognized_login_devices(profile_id,device_hash) VALUES(p_profile,p_device) ON CONFLICT DO NOTHING;inserted:=FOUND;
 UPDATE public.recognized_login_devices SET last_seen_at=now() WHERE profile_id=p_profile AND device_hash=p_device;
 IF inserted THEN INSERT INTO public.login_security_notifications(profile_id,device_hash,session_hash,recipient,metadata) VALUES(p_profile,p_device,p_session,p_recipient,p_metadata) ON CONFLICT DO NOTHING;END IF;
END $$;
CREATE FUNCTION public.claim_login_security_v1() RETURNS SETOF public.login_security_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE public.login_security_notifications SET state='NEEDS_REVIEW',error_code='SMTP_UNCONFIRMED',lease_until=NULL WHERE state='SENDING' AND lease_until<now();
 -- Limit IP/device detail retention; keep minimal deduplication hashes.
 UPDATE public.login_security_notifications SET metadata='{}' WHERE login_at<now()-interval '30 days' AND metadata<>'{}';
 RETURN QUERY UPDATE public.login_security_notifications j SET state='SENDING',attempts=attempts+1,lease_until=now()+interval '2 minutes' WHERE id IN (SELECT id FROM public.login_security_notifications WHERE state IN ('PENDING','RETRY') AND next_attempt_at<=now() ORDER BY login_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.queue_login_security_v1(uuid,text,text,text,jsonb),public.claim_login_security_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_login_security_v1(uuid,text,text,text,jsonb),public.claim_login_security_v1() TO service_role;
NOTIFY pgrst,'reload schema';
