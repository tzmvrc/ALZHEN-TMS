ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locked_at timestamptz, ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.profiles(id);
CREATE TABLE IF NOT EXISTS public.device_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 session_hash text NOT NULL UNIQUE CHECK(length(session_hash)=64), auth_session_id uuid,
 device_identifier uuid, browser_name text NOT NULL DEFAULT 'Unknown browser', operating_system text NOT NULL DEFAULT 'Unknown OS',
 device_category text NOT NULL DEFAULT 'unknown', created_at timestamptz NOT NULL DEFAULT now(), last_activity_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz, revoked_at timestamptz, revoked_by uuid REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')), role text NOT NULL CHECK(role IN ('ADMIN','STAFF','TRUCKER'))
);
CREATE INDEX IF NOT EXISTS device_sessions_profile_active_idx ON public.device_sessions(profile_id) WHERE revoked_at IS NULL;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_sessions FROM anon,authenticated;
GRANT ALL ON public.device_sessions TO service_role;
INSERT INTO public.device_sessions(profile_id,session_hash,role,created_at,last_activity_at,expires_at)
 SELECT profile_id,session_hash,role,created_at,created_at,expires_at FROM public.admin_staff_session_days ON CONFLICT(session_hash) DO NOTHING;
INSERT INTO public.device_sessions(profile_id,session_hash,role,created_at,last_activity_at)
 SELECT profile_id,session_hash,'TRUCKER',created_at,updated_at FROM public.trucker_active_sessions ON CONFLICT(session_hash) DO NOTHING;
CREATE OR REPLACE FUNCTION public.register_device_session_v1(p_profile uuid,p_hash text,p_auth uuid,p_metadata jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.profiles%ROWTYPE; expiry timestamptz;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=p_profile FOR UPDATE;
 IF NOT FOUND OR p.deactivated_at IS NOT NULL OR p.locked_at IS NOT NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501';END IF;
 IF p.role='TRUCKER' THEN
  IF NOT EXISTS(SELECT 1 FROM public.trucker_active_sessions WHERE profile_id=p_profile AND session_hash=p_hash) THEN RAISE EXCEPTION 'Session replaced' USING ERRCODE='42501';END IF;
  UPDATE public.device_sessions SET revoked_at=now(),status='REVOKED' WHERE profile_id=p_profile AND session_hash<>p_hash AND revoked_at IS NULL;
 ELSE
  SELECT expires_at INTO expiry FROM public.admin_staff_session_days WHERE profile_id=p_profile AND session_hash=p_hash;
  IF expiry IS NULL OR expiry<=now() THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501';END IF;
 END IF;
 INSERT INTO public.device_sessions(profile_id,session_hash,auth_session_id,device_identifier,browser_name,operating_system,device_category,role,expires_at)
 VALUES(p_profile,p_hash,p_auth,nullif(p_metadata->>'device_identifier','')::uuid,left(coalesce(p_metadata->>'browser_name','Unknown browser'),80),left(coalesce(p_metadata->>'operating_system','Unknown OS'),80),left(coalesce(p_metadata->>'device_category','unknown'),20),p.role,expiry)
 ON CONFLICT(session_hash) DO UPDATE SET last_activity_at=now()
 WHERE device_sessions.revoked_at IS NULL;
END $$;
CREATE OR REPLACE FUNCTION public.check_device_session_v1(p_profile uuid,p_hash text,p_auth uuid,p_metadata jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.device_sessions%ROWTYPE; p public.profiles%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=p_profile;
 IF p.locked_at IS NOT NULL THEN RETURN 'ACCOUNT_LOCKED';END IF;
 IF p.id IS NULL OR p.deactivated_at IS NOT NULL THEN RETURN 'SESSION_REVOKED';END IF;
 SELECT * INTO s FROM public.device_sessions WHERE profile_id=p_profile AND session_hash=p_hash;
 IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.status<>'ACTIVE' OR s.expires_at<=now()
 OR (s.auth_session_id IS NOT NULL AND s.auth_session_id IS DISTINCT FROM p_auth) THEN RETURN 'SESSION_REVOKED';END IF;
 IF s.role='TRUCKER' AND NOT EXISTS(SELECT 1 FROM public.trucker_active_sessions WHERE profile_id=p_profile AND session_hash=p_hash) THEN RETURN 'SESSION_REVOKED';END IF;
 IF s.role IN ('ADMIN','STAFF') AND NOT EXISTS(SELECT 1 FROM public.admin_staff_session_days WHERE profile_id=p_profile AND session_hash=p_hash AND expires_at>now()) THEN RETURN 'SESSION_REVOKED';END IF;
 IF s.last_activity_at<now()-interval '60 seconds' OR s.browser_name='Unknown browser' OR s.auth_session_id IS NULL AND p_auth IS NOT NULL THEN
 UPDATE public.device_sessions SET last_activity_at=now(),auth_session_id=coalesce(auth_session_id,p_auth),
 browser_name=CASE WHEN browser_name='Unknown browser' THEN coalesce(p_metadata->>'browser_name',browser_name) ELSE browser_name END,
 operating_system=CASE WHEN operating_system='Unknown OS' THEN coalesce(p_metadata->>'operating_system',operating_system) ELSE operating_system END,
 device_category=CASE WHEN device_category='unknown' THEN coalesce(p_metadata->>'device_category',device_category) ELSE device_category END
 WHERE id=s.id AND revoked_at IS NULL;
 END IF;
 RETURN 'ACTIVE';
END $$;
CREATE OR REPLACE FUNCTION public.manage_device_security_v1(p_actor uuid,p_subject uuid,p_action text,p_session uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.profiles%ROWTYPE; target_hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='ADMIN' AND locked_at IS NULL AND deactivated_at IS NULL) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_subject FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='P0002';END IF;
 IF p_action='lock' THEN
  IF p_actor=p_subject THEN RAISE EXCEPTION 'You cannot lock your own account' USING ERRCODE='22023';END IF;
  UPDATE public.profiles SET locked_at=coalesce(locked_at,now()),locked_by=p_actor WHERE id=p_subject;
 ELSIF p_action='unlock' THEN
  UPDATE public.profiles SET locked_at=NULL,locked_by=NULL WHERE id=p_subject;
 ELSIF p_action='revoke' THEN
  SELECT session_hash INTO target_hash FROM public.device_sessions WHERE id=p_session AND profile_id=p_subject;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found' USING ERRCODE='P0002';END IF;
 ELSIF p_action<>'revoke_all' THEN RAISE EXCEPTION 'Invalid security action' USING ERRCODE='22023';
 END IF;
 IF p_action<>'unlock' THEN
 UPDATE public.device_sessions SET revoked_at=coalesce(revoked_at,now()),revoked_by=p_actor,status='REVOKED' WHERE profile_id=p_subject AND (p_action<>'revoke' OR id=p_session);
 DELETE FROM public.trucker_active_sessions WHERE profile_id=p_subject AND (p_action<>'revoke' OR session_hash=target_hash);
 DELETE FROM public.admin_staff_session_days WHERE profile_id=p_subject AND (p_action<>'revoke' OR session_hash=target_hash);
 END IF;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_data) VALUES(p_actor,'DEVICE_SECURITY_'||upper(p_action),'profiles',p_subject,jsonb_build_object('session_id',p_session));
END $$;
REVOKE ALL ON FUNCTION public.register_device_session_v1(uuid,text,uuid,jsonb),public.check_device_session_v1(uuid,text,uuid,jsonb),public.manage_device_security_v1(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_session_v1(uuid,text,uuid,jsonb),public.check_device_session_v1(uuid,text,uuid,jsonb),public.manage_device_security_v1(uuid,uuid,text,uuid) TO service_role;
