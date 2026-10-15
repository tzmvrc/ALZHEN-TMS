create extension if not exists pgcrypto;

create table if not exists driver_trip_updates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  driver_id uuid not null,
  status text,
  delivery_status text,
  dr_number text,
  pod_image_url text,
  pod_image_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table driver_trip_updates
  add column if not exists pod_image_path text;

create index if not exists idx_driver_trip_updates_trip
  on driver_trip_updates (trip_id);

create index if not exists idx_driver_trip_updates_driver
  on driver_trip_updates (driver_id);

create index if not exists idx_driver_trip_updates_updated_at
  on driver_trip_updates (updated_at desc);

alter table driver_trip_updates enable row level security;
revoke all on table driver_trip_updates from anon, authenticated;
grant all on table driver_trip_updates to service_role;
