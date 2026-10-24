// Preparation only: no network, credentials, or database execution.
import {readFile,writeFile} from 'node:fs/promises';
const source=new URL('../migrations/proposals/2026_10_24_demo30_seed.sql',import.meta.url);
const original=await readFile(source,'utf8');
const match=/\$payload\$([\s\S]*?)\$payload\$/.exec(original);
if(!match)throw Error('Approved demo payload not found');
const payload=JSON.parse(match[1]);
if(payload.trips?.length!==30||Object.values(payload).flat().some(row=>!row.id?.startsWith('e6301024-')))throw Error('Unexpected demo ownership namespace');
const names=['customers','trucking_companies','products','trip_types','warehouses','trucks','drivers','customer_stores','trips','trip_truck_assignments','trip_stops','trip_line_items','trip_assignment_stops','trip_cargo_allocations','loading_reports','unloading_reports','incidents','trip_events','driver_trip_updates'];
if(names.some(name=>!payload[name]?.length)||Object.keys(payload).length!==names.length)throw Error('Unexpected seed tables');
const sql=`-- Explicitly approved restoration, 2026-10-24. INSERT MISSING demo IDs only.
-- Existing operational rows and existing demo edits are never updated/deleted.
-- Abort on an occupied ID, changed identity/relationship, or unique/FK guard.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $restore$
DECLARE payload jsonb:=$payload$${match[1]}$payload$::jsonb;
 reviewer uuid:='8eaf7847-e806-493d-8338-ac0412153245';
 table_name text; columns_sql text; identity_key text; existing jsonb; expected jsonb; inserted integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ALZHEN_DEMO30_V1'));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=reviewer AND role='ADMIN' AND deactivated_at IS NULL) THEN RAISE EXCEPTION 'The approved coordinate reviewer is not an active Admin'; END IF;
 IF (SELECT count(*) FROM public.tms_dropdown_options WHERE field_key='trip_status' AND option_value IN('PLANNED','IN_PROGRESS','COMPLETED') AND active)<>3 THEN RAISE EXCEPTION 'Required existing statuses unavailable'; END IF;
 FOREACH table_name IN ARRAY ARRAY[${names.map(name=>"'"+name+"'").join(',')}] LOOP
  FOR existing IN EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text LIKE ''e6301024-%%''',table_name) LOOP
   SELECT value INTO expected FROM jsonb_array_elements(payload->table_name) WHERE value->>'id'=existing->>'id';
   IF expected IS NULL THEN RAISE EXCEPTION 'Reserved demo namespace contains an unexpected ID in %',table_name; END IF;
   FOREACH identity_key IN ARRAY ARRAY['code','sku','plate_number','license_number','dispatch_number','trip_id','trip_stop_id','assignment_id','trip_line_item_id','truck_id','driver_id','product_id','warehouse_id','customer_id','store_id','source_warehouse_id'] LOOP
    IF expected?identity_key AND existing->identity_key IS DISTINCT FROM expected->identity_key THEN RAISE EXCEPTION 'Demo identity or relationship changed in %: %; nothing overwritten',table_name,identity_key; END IF;
   END LOOP;
   IF expected?'profile_id' AND existing->'profile_id' IS DISTINCT FROM expected->'profile_id' THEN RAISE EXCEPTION 'Demo driver now belongs to an account; nothing overwritten'; END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.trips t JOIN jsonb_array_elements(payload->'trips') r ON (t.dispatch_number=r->>'dispatch_number' OR t.trip_reference=r->>'trip_reference') AND t.id<>(r->>'id')::uuid) THEN RAISE EXCEPTION 'Demo identifier collides with another operational trip'; END IF;
 FOREACH table_name IN ARRAY ARRAY[${names.map(name=>"'"+name+"'").join(',')}] LOOP
  SELECT string_agg(quote_ident(key),',' ORDER BY key) INTO columns_sql FROM jsonb_object_keys(payload->table_name->0) key;
  EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_recordset(NULL::public.%1$I,$1) r WHERE NOT EXISTS(SELECT 1 FROM public.%1$I current_row WHERE current_row.id=r.id)',table_name,columns_sql) USING payload->table_name;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  RAISE NOTICE 'Restored % missing demo rows in %',inserted,table_name;
 END LOOP;
 IF (SELECT count(*) FROM public.trips WHERE id::text LIKE 'e6301024-%' AND remarks LIKE '%[ALZHEN_DEMO30_V1]%')<>30 THEN RAISE EXCEPTION 'Expected exactly 30 identifiable demo trips'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_line_items l LEFT JOIN public.trip_cargo_allocations a ON a.trip_line_item_id=l.id WHERE l.id::text LIKE 'e6301024-%' GROUP BY l.id,l.quantity,l.cbm HAVING sum(a.quantity) IS DISTINCT FROM l.quantity OR sum(a.allocated_cbm) IS DISTINCT FROM l.cbm) THEN RAISE EXCEPTION 'Demo cargo totals do not reconcile'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_cargo_allocations a JOIN public.trip_line_items l ON l.id=a.trip_line_item_id LEFT JOIN public.trip_assignment_stops s ON s.assignment_id=a.assignment_id AND s.trip_stop_id=l.trip_stop_id WHERE a.id::text LIKE 'e6301024-%' AND s.id IS NULL) THEN RAISE EXCEPTION 'Demo truck stop responsibility is incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_stops s JOIN public.trip_line_items l ON l.trip_stop_id=s.id WHERE s.id::text LIKE 'e6301024-%' GROUP BY s.id,s.quantity,s.total_cbm HAVING sum(l.quantity)<>s.quantity OR sum(l.cbm)<>s.total_cbm) THEN RAISE EXCEPTION 'Demo stop totals differ from cargo'; END IF;
END $restore$;
COMMIT;
SELECT ${names.map(name=>`(SELECT count(*) FROM public.${name} WHERE id::text LIKE 'e6301024-%') AS ${name}`).join(',\n')};
`;
const destination=new URL('../migrations/proposals/2026_10_24_demo30_restore.sql',import.meta.url);
await writeFile(destination,sql);
console.log(JSON.stringify({prepared:true,executed:false,trips:30,tables:names.length,records:Object.values(payload).reduce((n,rows)=>n+rows.length,0),file:'2026_10_24_demo30_restore.sql'}));
