-- Serialize receipt coverage using the writer's existing trip-first lock order.
-- Receipt quantities are metadata; never update physical cargo or unloading.
CREATE FUNCTION public.pod_receipt_json_header_v1(p_text text,p_label text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE entry text;
BEGIN
 IF p_label NOT IN ('Product Selections','Model Quantities') OR position('--- Scanned text ---' in coalesce(p_text,''))=0 THEN RETURN NULL;END IF;
 SELECT value INTO entry FROM regexp_split_to_table(split_part(p_text,'--- Scanned text ---',1),E'\n') value WHERE value LIKE p_label||': %' LIMIT 1;
 RETURN substring(entry from length(p_label)+3)::jsonb;
EXCEPTION WHEN invalid_text_representation THEN RETURN CASE WHEN p_label='Product Selections' THEN '[]'::jsonb ELSE NULL END;
END $$;
REVOKE ALL ON FUNCTION public.pod_receipt_json_header_v1(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_pod_allocation_coverage_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE selections jsonb; chosen record; covered numeric;
BEGIN
 IF NEW.kind IS DISTINCT FROM 'receipt' OR NEW.delivery_event_id IS NULL THEN RETURN NEW;END IF;
 selections:=public.pod_receipt_json_header_v1(NEW.ocr_text,'Product Selections');
 IF jsonb_typeof(selections) IS DISTINCT FROM 'array' THEN RETURN NEW;END IF;
 -- Do not reinterpret historical coverage on ordinary review/field corrections.
 IF TG_OP='UPDATE' AND OLD.kind='receipt' AND OLD.delivery_event_id=NEW.delivery_event_id
  AND public.pod_receipt_json_header_v1(OLD.ocr_text,'Product Selections')=selections THEN RETURN NEW;END IF;
 PERFORM 1 FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
 FOR chosen IN
  SELECT v,ca.quantity,ca.id,li.id line_id,li.product_id,li.customer_model,p.model_code,
   coalesce(nullif(trim(li.dr_number),''),nullif(trim(st.dr_number),'')) dr
  FROM jsonb_array_elements(selections) v
  JOIN public.trip_cargo_allocations ca ON ca.id::text=v->>'allocation_id' AND ca.assignment_id=NEW.assignment_id AND ca.trip_id=NEW.trip_id
  JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id AND li.trip_stop_id=NEW.trip_stop_id
  JOIN public.trip_stops st ON st.id=li.trip_stop_id
  LEFT JOIN public.products p ON p.id=li.product_id
 LOOP
  WITH documents AS (
   SELECT DISTINCT ON (coalesce(im.delivery_event_id,im.id)) im.*
   FROM public.trip_images im
   WHERE im.trip_id=NEW.trip_id AND im.assignment_id=NEW.assignment_id AND im.trip_stop_id=NEW.trip_stop_id AND im.kind='receipt'
    AND coalesce(im.pod_review_status,'PENDING') IN ('PENDING','APPROVED')
    AND (im.delivery_upload_state='READY' OR im.delivery_upload_state IS NULL)
    AND coalesce(im.delivery_event_id,im.id)<>NEW.delivery_event_id
   ORDER BY coalesce(im.delivery_event_id,im.id),im.display_order NULLS FIRST,im.id
  ), headers AS (
   SELECT d.*,public.pod_receipt_json_header_v1(d.ocr_text,'Product Selections') items,
    public.pod_receipt_json_header_v1(d.ocr_text,'Model Quantities') quantities,
    (SELECT substring(value from length('Model Codes: ')+1) FROM regexp_split_to_table(split_part(d.ocr_text,'--- Scanned text ---',1),E'\n') value WHERE value LIKE 'Model Codes: %' LIMIT 1) models
   FROM documents d
  )
  SELECT coalesce(sum(CASE WHEN items IS NOT NULL THEN
   (SELECT coalesce(sum((entry->>'quantity')::numeric),0) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(items)='array' THEN items ELSE '[]'::jsonb END) entry
    WHERE entry->>'allocation_id'=chosen.id::text AND entry->>'line_item_id'=chosen.line_id::text
     AND entry->>'assignment_id'=NEW.assignment_id::text AND entry->>'trip_stop_id'=NEW.trip_stop_id::text
     AND trim(entry->>'dr_number')=chosen.dr AND entry->>'model' IN (chosen.customer_model,chosen.model_code)
     AND (entry->>'product_id' IS NULL OR entry->>'product_id'=chosen.product_id::text)
     AND coalesce(entry->>'quantity','') ~ '^[0-9]+$')
   WHEN trim(dr_number)=chosen.dr AND EXISTS(SELECT 1 FROM unnest(string_to_array(models,',')) model WHERE trim(model) IN (chosen.customer_model,chosen.model_code))
    AND 1=(SELECT count(*) FROM public.trip_cargo_allocations ca JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id LEFT JOIN public.products p ON p.id=li.product_id
     WHERE ca.assignment_id=NEW.assignment_id AND ca.trip_id=NEW.trip_id AND li.trip_stop_id=NEW.trip_stop_id
      AND coalesce(nullif(trim(li.dr_number),''),chosen.dr)=chosen.dr
      AND (li.customer_model IN (chosen.customer_model,chosen.model_code) OR p.model_code IN (chosen.customer_model,chosen.model_code)))
   THEN CASE WHEN coalesce(quantities->>coalesce(chosen.model_code,chosen.customer_model),'') ~ '^[0-9]+$'
    THEN (quantities->>coalesce(chosen.model_code,chosen.customer_model))::numeric ELSE chosen.quantity END
   ELSE 0 END),0) INTO covered FROM headers;
  IF coalesce(chosen.v->>'quantity','') ~ '^[0-9]+$' AND (chosen.v->>'quantity')::numeric>greatest(0,chosen.quantity-covered) THEN
   RAISE EXCEPTION 'Selected quantity exceeds remaining POD coverage. Another submitted POD already covers this allocation. Review the product quantities.' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pod_allocation_coverage_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pod_allocation_coverage_guard BEFORE INSERT OR UPDATE OF ocr_text,kind,delivery_event_id ON public.trip_images FOR EACH ROW EXECUTE FUNCTION public.guard_pod_allocation_coverage_v1();
NOTIFY pgrst,'reload schema';
