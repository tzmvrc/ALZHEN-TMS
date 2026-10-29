import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=(file:string)=>readFile(new URL('../../migrations/'+file,import.meta.url),'utf8');
/** Metadata-only fixture; no operational records or external services. */
export async function podIntegrationFixture(includeCrew=true){
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);insert into storage.buckets values('trip-images','trip-images',false,5242880,array['image/jpeg','image/png','image/webp']);create table pod_records(id uuid primary key default gen_random_uuid(),trip_id uuid,trip_stop_id uuid,dr_number text,pod_status text,pod_received_at timestamptz,transmittal_reference text,remarks text);`);
  const schema=JSON.parse(await readFile(new URL('./delivery-companion-schema.json',import.meta.url),'utf8'));
  for(const table of schema)await db.exec(`create table public.${table.name} (${table.columns}${table.constraints?.length?', '+table.constraints.join(', '):''})`);
  await db.exec(`create table demurrages(id uuid primary key default gen_random_uuid(),trip_id uuid,trip_stop_id uuid,reason text,remarks text,created_by uuid,status text,waiting_minutes int,created_at timestamptz default now());create table tms_dropdown_options(id uuid default gen_random_uuid(),field_key text,option_value text,display_label text,sort_order int,active boolean,is_system boolean);create unique index dropdown_field_value on tms_dropdown_options(field_key,lower(option_value));create table admin_notifications(id uuid default gen_random_uuid(),recipient_profile_id uuid,actor_profile_id uuid,notification_type text constraint admin_notifications_notification_type_check check(notification_type in ('report_mention')),reference_type text,reference_id uuid,trip_id uuid,event_key uuid,message text,metadata jsonb,created_at timestamptz,read_at timestamptz,unique(recipient_profile_id,event_key));create function notify_admin_source_change() returns trigger language plpgsql as $$begin return null;end$$;`);
  for(const file of ['2026_10_25_delivery_companion.sql','2026_10_25_delivery_companion_integrity.sql','2026_10_25_delivery_review_order.sql','2026_10_27_delivery_arrival_gps_policy.sql'])await db.exec(await migration(file));
  await db.exec(await readFile(new URL('./operational-resource-guard.sql',import.meta.url),'utf8'));
  await db.exec(`create view v_tms_combined as select m.delivery_status,m.arrival_time,m.signed_dr_upload_date,m._assignment_id,m._trip_stop_id,m.dr_number from (select s.delivery_status,s.arrival_time,null::date signed_dr_upload_date,a.id _assignment_id,s.id _trip_stop_id,s.trip_id _trip_id,null::text dr_number from trip_stops s join trip_truck_assignments a on a.trip_id=s.trip_id) m left join trips parent on parent.id=m._trip_id;`);
  for(const file of ['2026_10_28_confirmed_operational_state.sql','2026_10_28_operational_report_email.sql','2026_10_28_operational_workflow_rpc.sql','2026_10_28_operational_state_safeguards.sql','2026_10_28_operational_state_batch.sql','2026_10_28_operational_reporting_compatibility.sql','2026_10_28_required_stop_completion.sql','2026_10_28_operational_status_defaults.sql','2026_10_28_operational_report_views.sql','2026_10_28_operational_email_provider_feedback.sql'])await db.exec(await migration(file));
  const review=await migration('2026_10_31_proposed_pod_review.sql');
  await db.exec('BEGIN;'+review.slice(review.indexOf('CREATE TABLE public.pod_review_events'),review.indexOf('-- Recovery:')));
  // These two definitions were read from live pg_proc, without copying any data.
  await db.exec(await readFile(new URL('./pod-live-review-functions.sql',import.meta.url),'utf8'));
  await db.exec(await migration('2026_10_30_simplified_delivery_sequence.sql'));
  await db.exec(await migration('2026_11_04_proposed_pod_submission_review.sql'));
  await db.exec(await migration('2026_11_04_proposed_pod_submission_review.sql'));
  await db.exec(await migration('2026_11_13_pod_replacement_terminal_guard.sql'));
  await db.exec(await migration('2026_11_14_pod_operational_progress.sql'));
  await db.exec(await migration('2026_11_15_explicit_destination_transit.sql'));
  await db.exec(`create table if not exists trip_operational_signals(trip_id uuid,source text,record_id uuid,revision uuid default gen_random_uuid(),changed_at timestamptz default now(),unique(trip_id,source));`);
  if(includeCrew){await db.exec(`alter table profiles add column if not exists locked_at timestamptz;create schema if not exists auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);await db.exec(await migration('2026_11_16_truck_crew.sql'));await db.exec(await migration('2026_11_17_crew_read_scope.sql'));}
  return db;
 }catch(error){await db.close();throw error;}
}
