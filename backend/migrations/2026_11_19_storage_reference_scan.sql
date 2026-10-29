-- Keep reference checks bounded in CPU: path fields first, cheap JSON candidate filtering, chunked URL decoding.
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

