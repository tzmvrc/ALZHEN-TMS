-- Separate driver receipts from gallery photos while keeping private storage.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.trip_images
  add column if not exists kind text not null default 'photo' check (kind in ('photo', 'receipt')),
  add column if not exists trip_stop_id uuid references public.trip_stops(id) on delete set null,
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists dr_number text,
  add column if not exists ocr_text text,
  add column if not exists ocr_confidence double precision check (ocr_confidence between 0 and 100),
  add column if not exists ocr_version integer not null default 0,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

create index if not exists trip_images_receipts_idx
  on public.trip_images (trip_id, trip_stop_id, created_at desc) where kind = 'receipt';

-- Retain old receipt images and classify those identified by the existing audit.
-- Only attach a stop when the saved DR identifies exactly one stop.
with latest as (
  select distinct on (pod_image_path) trip_id, driver_id, dr_number, pod_image_path
  from public.driver_trip_updates where pod_image_path is not null
  order by pod_image_path, updated_at desc, id desc
), matched as (
  select u.*, d.profile_id,
    (select case when count(distinct s.id) = 1 then min(s.id::text)::uuid end
     from public.trip_stops s
     where s.trip_id = u.trip_id and u.dr_number is not null and
       ((to_jsonb(s)->>'dr_number') = u.dr_number or exists
         (select 1 from public.trip_line_items li where li.trip_stop_id = s.id and li.dr_number = u.dr_number))) as stop_id
  from latest u left join public.drivers d on d.id = u.driver_id
)
update public.trip_images i set kind = 'receipt', trip_stop_id = m.stop_id,
  dr_number = m.dr_number, uploaded_by = m.profile_id
from matched m where i.storage_path = m.pod_image_path and i.trip_id = m.trip_id and i.kind = 'photo';

-- Only staff may subscribe to receipt metadata; image access stays server-signed.
grant select on public.trip_images to authenticated;
drop policy if exists trip_images_staff_read on public.trip_images;
create policy trip_images_staff_read on public.trip_images for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('ADMIN', 'STAFF')));

do $$ declare source_table text; begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach source_table in array array['trips', 'trip_stops', 'trip_events', 'loading_reports', 'unloading_reports', 'trip_images'] loop
    if to_regclass(format('public.%I', source_table)) is not null and not exists
      (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = source_table) then
      execute format('alter publication supabase_realtime add table public.%I', source_table);
    end if;
  end loop;
end $$;
commit;
