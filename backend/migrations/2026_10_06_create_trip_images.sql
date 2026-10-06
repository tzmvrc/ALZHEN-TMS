create table if not exists public.trip_images (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_images
  add column if not exists display_order integer not null default 0;

create index if not exists trip_images_trip_order_idx
  on public.trip_images (trip_id, display_order, created_at);

alter table public.trip_images enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.trip_images to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-images',
  'trip-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
