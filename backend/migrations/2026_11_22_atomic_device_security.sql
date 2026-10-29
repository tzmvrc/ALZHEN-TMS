ALTER TABLE public.device_sessions ADD COLUMN IF NOT EXISTS approximate_location text;
ALTER TABLE public.login_security_notifications DROP CONSTRAINT login_security_notifications_profile_id_device_hash_key;
ALTER TABLE public.login_security_notifications ADD CONSTRAINT login_security_session_device_unique UNIQUE(profile_id,device_hash,session_hash);
CREATE OR REPLACE FUNCTION public.queue_login_security_v1(p_profile uuid,p_device text,p_session text,p_recipient text,p_metadata jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE inserted boolean; recipient text; observed timestamptz;
BEGIN
 SELECT created_at INTO observed FROM public.device_sessions WHERE profile_id=p_profile AND session_hash=p_session AND status='ACTIVE' AND revoked_at IS NULL AND encode(sha256(convert_to(device_identifier::text,'UTF8')),'hex')=p_device;
 IF observed IS NULL THEN RAISE EXCEPTION 'Verified matching device session required' USING ERRCODE='42501';END IF;
 SELECT email INTO recipient FROM auth.users WHERE id=p_profile;
 IF recipient IS NULL THEN RAISE EXCEPTION 'Registered email unavailable';END IF;
 INSERT INTO public.recognized_login_devices(profile_id,device_hash) VALUES(p_profile,p_device) ON CONFLICT DO NOTHING;inserted:=FOUND;
 UPDATE public.recognized_login_devices SET last_seen_at=now() WHERE profile_id=p_profile AND device_hash=p_device;
 IF inserted THEN INSERT INTO public.login_security_notifications(profile_id,device_hash,session_hash,recipient,metadata,login_at) VALUES(p_profile,p_device,p_session,recipient,p_metadata,observed) ON CONFLICT DO NOTHING;END IF;
END $$;
ALTER FUNCTION public.register_device_session_v1(uuid,text,uuid,jsonb) RENAME TO register_device_session_core_v1;
CREATE FUNCTION public.register_device_session_v1(p_profile uuid,p_hash text,p_auth uuid,p_metadata jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE device uuid;
BEGIN
 PERFORM public.register_device_session_core_v1(p_profile,p_hash,p_auth,p_metadata);
 SELECT device_identifier INTO device FROM public.device_sessions WHERE profile_id=p_profile AND session_hash=p_hash;
 IF device IS NOT NULL THEN PERFORM public.queue_login_security_v1(p_profile,encode(sha256(convert_to(device::text,'UTF8')),'hex'),p_hash,NULL,jsonb_build_object('browser_name',p_metadata->>'browser_name','operating_system',p_metadata->>'operating_system','device_category',p_metadata->>'device_category','ip',left(p_metadata->>'ip',100),'location','Location unavailable'));END IF;
END $$;
CREATE FUNCTION public.forget_login_device_v1(p_actor uuid,p_subject uuid,p_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE device uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND deactivated_at IS NULL AND locked_at IS NULL AND (id=p_subject OR role='ADMIN')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_subject FOR UPDATE;
 SELECT device_identifier INTO device FROM public.device_sessions WHERE id=p_session AND profile_id=p_subject;
 IF device IS NULL THEN RAISE EXCEPTION 'Device record unavailable' USING ERRCODE='P0002';END IF;
 DELETE FROM public.recognized_login_devices WHERE profile_id=p_subject AND device_hash=encode(sha256(convert_to(device::text,'UTF8')),'hex');
 UPDATE public.device_sessions SET status='REVOKED',revoked_at=coalesce(revoked_at,now()),revoked_by=p_actor WHERE profile_id=p_subject AND device_identifier=device;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_data) VALUES(p_actor,'LOGIN_DEVICE_FORGOTTEN','profiles',p_subject,jsonb_build_object('device_session_id',p_session));
END $$;
REVOKE ALL ON FUNCTION public.register_device_session_v1(uuid,text,uuid,jsonb),public.forget_login_device_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_session_v1(uuid,text,uuid,jsonb),public.forget_login_device_v1(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
