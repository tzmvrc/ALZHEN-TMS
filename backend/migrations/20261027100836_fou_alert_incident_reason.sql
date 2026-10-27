-- Reuse the existing incident reason lookup for FOU Alert reports.
insert into public.incident_reasons (code, name, description, active)
values ('FOU_ALERT', 'FOU Alert', 'Field operations update alert', true)
on conflict (code) do nothing;
