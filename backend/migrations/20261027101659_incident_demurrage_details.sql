-- One incident or demurrage row retains its own quantities and submission details.
alter table public.incidents
  add column if not exists number_of_boxes integer,
  add column if not exists remarks text;

alter table public.demurrages
  add column if not exists number_of_boxes integer,
  add column if not exists submitted_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_number_of_boxes_nonnegative' and conrelid = 'public.incidents'::regclass) then
    alter table public.incidents add constraint incidents_number_of_boxes_nonnegative check (number_of_boxes is null or number_of_boxes >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demurrages_number_of_boxes_nonnegative' and conrelid = 'public.demurrages'::regclass) then
    alter table public.demurrages add constraint demurrages_number_of_boxes_nonnegative check (number_of_boxes is null or number_of_boxes >= 0);
  end if;
end $$;
