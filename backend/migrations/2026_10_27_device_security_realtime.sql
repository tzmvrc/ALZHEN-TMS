CREATE TABLE public.device_security_signals (
 profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 revision uuid NOT NULL DEFAULT gen_random_uuid(), changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.device_security_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_security_signals FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.device_security_signals TO service_role;
CREATE OR REPLACE FUNCTION public.signal_device_security_change_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE subject uuid;
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF (NEW.locked_at,NEW.deactivated_at,NEW.role) IS NOT DISTINCT FROM (OLD.locked_at,OLD.deactivated_at,OLD.role) THEN RETURN NEW;END IF;
  subject:=NEW.id;
 ELSE
  IF TG_OP='UPDATE' AND (NEW.revoked_at,NEW.status,NEW.expires_at) IS NOT DISTINCT FROM (OLD.revoked_at,OLD.status,OLD.expires_at) THEN RETURN NEW;END IF;
  subject:=CASE WHEN TG_OP='DELETE' THEN OLD.profile_id ELSE NEW.profile_id END;
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=subject) THEN
  INSERT INTO public.device_security_signals(profile_id) VALUES(subject)
  ON CONFLICT(profile_id) DO UPDATE SET revision=gen_random_uuid(),changed_at=clock_timestamp();
  INSERT INTO public.admin_change_signals(topic) VALUES('device_sessions')
  ON CONFLICT(topic) DO UPDATE SET revision=gen_random_uuid(),changed_at=clock_timestamp();
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.signal_device_security_change_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER device_security_signal AFTER INSERT OR DELETE OR UPDATE OF revoked_at,status,expires_at ON public.device_sessions
 FOR EACH ROW EXECUTE FUNCTION public.signal_device_security_change_v1();
CREATE TRIGGER account_security_signal AFTER UPDATE OF locked_at,deactivated_at,role ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.signal_device_security_change_v1();
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_security_signals;
