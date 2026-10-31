-- Validate existing receipt metadata atomically; never change physical quantities.
CREATE FUNCTION public.guard_pod_allocation_scope_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE header text; entry text; selections jsonb;
BEGIN
 IF NEW.kind IS DISTINCT FROM 'receipt' OR NEW.ocr_text IS NULL OR position('--- Scanned text ---' in NEW.ocr_text)=0 THEN RETURN NEW;END IF;
 header:=split_part(NEW.ocr_text,'--- Scanned text ---',1);
 SELECT value INTO entry FROM regexp_split_to_table(header,E'\n') value WHERE value LIKE 'Product Selections: %' LIMIT 1;
 IF entry IS NULL THEN RETURN NEW;END IF;
 selections:=substring(entry from length('Product Selections: ')+1)::jsonb;
 IF jsonb_typeof(selections)<>'array' OR jsonb_array_length(selections)>500 THEN RAISE EXCEPTION 'Choose valid POD cargo selections.' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(selections))<>(SELECT count(DISTINCT value->>'allocation_id') FROM jsonb_array_elements(selections)) THEN RAISE EXCEPTION 'Choose each allocation once.' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(selections) v
  LEFT JOIN public.trip_cargo_allocations ca ON ca.id=(v->>'allocation_id')::uuid AND ca.assignment_id=NEW.assignment_id AND ca.trip_id=NEW.trip_id
  LEFT JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id AND li.id=(v->>'line_item_id')::uuid AND li.trip_stop_id=NEW.trip_stop_id AND li.trip_id=NEW.trip_id
  LEFT JOIN public.trip_stops st ON st.id=li.trip_stop_id
  LEFT JOIN public.products p ON p.id=li.product_id
  WHERE ca.id IS NULL OR li.id IS NULL OR (v->>'assignment_id')::uuid IS DISTINCT FROM NEW.assignment_id OR (v->>'trip_stop_id')::uuid IS DISTINCT FROM NEW.trip_stop_id
   OR nullif(trim(v->>'dr_number'),'') IS DISTINCT FROM coalesce(nullif(trim(li.dr_number),''),nullif(trim(st.dr_number),''))
   OR NOT coalesce(v->>'model'=li.customer_model OR v->>'model'=p.model_code,false)
   OR (v->>'product_id' IS NOT NULL AND (v->>'product_id')::uuid IS DISTINCT FROM li.product_id)
   OR coalesce(v->>'quantity','') !~ '^[0-9]+$' OR (v->>'quantity')::numeric>ca.quantity
 ) THEN RAISE EXCEPTION 'POD cargo must match this assignment, stop, DR and assigned quantity.' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pod_allocation_scope_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pod_allocation_scope_guard BEFORE INSERT OR UPDATE OF ocr_text,kind,assignment_id,trip_stop_id ON public.trip_images FOR EACH ROW EXECUTE FUNCTION public.guard_pod_allocation_scope_v1();
NOTIFY pgrst,'reload schema';
