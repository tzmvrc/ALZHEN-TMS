-- Archives only this inspection's explicitly identified test records.
-- Retains evidence, events, cargo ledgers and audit history. No DELETE or RLS changes.
begin;
do $$
begin
  if not exists (select 1 from public.trips where id='b4f45241-8970-4d62-a872-4cc9ce28f1d5'
    and dispatch_number='VERIFY-025a23e6' and remarks like '[ALZHEN_VERIFY_025a23e6-%') then
    raise exception 'Verification identity does not match; no changes allowed';
  end if;
end $$;
-- Keep assignments and allocations intact: the cargo integrity guard forbids detaching delivered cargo.
update public.trips set archived_at=coalesce(archived_at,now())
where id='b4f45241-8970-4d62-a872-4cc9ce28f1d5' and dispatch_number='VERIFY-025a23e6';
update public.trucks set status='INACTIVE' where plate_number like 'VERIFY-025a23e6-%'
and id in (select truck_id from public.trip_truck_assignments where trip_id='b4f45241-8970-4d62-a872-4cc9ce28f1d5');
update public.drivers set status='INACTIVE' where first_name='Verification'
and profile_id in ('9fcd0ade-2e4f-43cc-b2d4-a50b8276ce15','a9f00156-b8ed-4ca4-b0a0-323b62800174');
update public.profiles set deactivated_at=coalesce(deactivated_at,now()) where first_name='Verification'
and id in ('9fcd0ade-2e4f-43cc-b2d4-a50b8276ce15','a9f00156-b8ed-4ca4-b0a0-323b62800174');
commit;
