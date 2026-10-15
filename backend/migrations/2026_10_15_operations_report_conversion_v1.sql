-- Atomic Operations Reports conversion. The conversion ledger is pre-existing;
-- this migration does not create tables or alter report data.
--
-- Semantic policy for every directed conversion:
--   * A Loading target requires newly supplied Loading timestamps. Loading and
--     Unloading clocks are not interchangeable.
--   * An Unloading target requires an existing source stop with at least one
--     persisted arrival/unloading timestamp. Loading -> Unloading is rejected
--     because Loading has no stop association. Stop timestamps are reused as
--     the Unloading timeline and snapshotted in full.
--   * A Backload or Offload target requires a newly supplied reason. Parent
--     fields with similar names are not copied across event types. Optional
--     target values must be supplied explicitly. Cargo child rows are not
--     moved between different item schemas; their complete rows are recorded
--     in source_items_snapshot and retained under the immutable source parent.
--   * All other unmatched source values remain in source_snapshot. Scope is
--     copied only from the actual source; no stop is invented.
--
-- PostgreSQL executes the function body as one transaction. Any failed check,
-- constraint, trigger, receipt update, or history insert rolls back all writes.

begin;

do $$
begin
  if to_regclass('public.report_receipts') is null
     or to_regclass('public.operations_report_conversions') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.trip_stops') is null
     or to_regclass('public.loading_reports') is null
     or to_regclass('public.unloading_reports') is null
     or to_regclass('public.backloads') is null
     or to_regclass('public.offloads') is null
     or to_regclass('public.backload_items') is null
     or to_regclass('public.offload_items') is null then
    raise exception 'A required Operations Reports, receipt, item, stop, profile, or conversion-history table is missing';
  end if;
end;
$$;

create or replace function public.convert_operations_report_v1(
  p_source_type text,
  p_source_id uuid,
  p_target_type text,
  p_actor_profile_id uuid,
  p_target_fields jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_table text;
  v_target_table text;
  v_source_receipt_col text;
  v_target_receipt_col text;
  v_source_row jsonb;
  v_source_stop jsonb;
  v_target_row jsonb;
  v_target_id uuid;
  v_trip_id uuid;
  v_stop_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_insert_cols text;
  v_insert_expr text;
  v_item_fk text;
  v_item_fk_count integer := 0;
  v_actor_role text;
  v_field text;
  v_source_columns text[];
  v_parent_columns text[];
  v_source_fk boolean;
  v_target_fk boolean;
  v_target_type_oid oid;
  v_target_relation regclass;
begin
  if p_source_type is null or p_target_type is null
     or p_source_type not in ('LOADING','UNLOADING','BACKLOAD','OFFLOAD')
     or p_target_type not in ('LOADING','UNLOADING','BACKLOAD','OFFLOAD') then
    raise exception using errcode='22023', message='Source and target types must be LOADING, UNLOADING, BACKLOAD, or OFFLOAD.';
  end if;
  if p_source_type = p_target_type then
    raise exception using errcode='22023', message='Source and target event types must differ.';
  end if;
  if p_source_id is null or p_actor_profile_id is null then
    raise exception using errcode='42501', message='An authenticated ADMIN or STAFF actor and source report are required.';
  end if;
  if p_target_fields is null or jsonb_typeof(p_target_fields) <> 'object' then
    raise exception using errcode='22023', message='target_fields must be a JSON object.';
  end if;

  select upper(role::text) into v_actor_role
  from public.profiles where id=p_actor_profile_id;
  if coalesce(v_actor_role,'') not in ('ADMIN','STAFF') then
    raise exception using errcode='42501', message='Only an ADMIN or STAFF actor may convert operational reports.';
  end if;

  v_source_table := case p_source_type when 'LOADING' then 'loading_reports' when 'UNLOADING' then 'unloading_reports' when 'BACKLOAD' then 'backloads' else 'offloads' end;
  v_target_table := case p_target_type when 'LOADING' then 'loading_reports' when 'UNLOADING' then 'unloading_reports' when 'BACKLOAD' then 'backloads' else 'offloads' end;
  v_source_receipt_col := case p_source_type when 'LOADING' then 'loading_report_id' when 'UNLOADING' then 'unloading_report_id' when 'BACKLOAD' then 'backload_id' else 'offload_id' end;
  v_target_receipt_col := case p_target_type when 'LOADING' then 'loading_report_id' when 'UNLOADING' then 'unloading_report_id' when 'BACKLOAD' then 'backload_id' else 'offload_id' end;
  v_target_relation := to_regclass(format('public.%I',v_target_table));
  if to_regclass(format('public.%I',v_source_table)) is null or v_target_relation is null
     or to_regclass('public.report_receipts') is null
     or to_regclass('public.operations_report_conversions') is null then
    raise exception using errcode='55000', message='A required report, receipt, or conversion-history table is missing; conversion is disabled.';
  end if;

  -- Lock currently attached receipts in stable order before locking the parent,
  -- matching the checked-in receipt trigger's receipt-row -> parent-row order.
  -- This scan must be NOWAIT: a receipt UPDATE already owns its tuple before
  -- its BEFORE trigger locks the NEW parent. Waiting here could participate in
  -- a cycle if another transaction owns a parent lock and is waiting on receipt
  -- work. Fail as a retryable conflict instead of waiting before we own source.
  begin
    perform r.id from public.report_receipts r
      where to_jsonb(r)->>v_source_receipt_col=p_source_id::text
      order by r.id for update nowait;
  exception when lock_not_available then
    raise exception using errcode='40001',
      message='A receipt is being changed for this report. Retry the conversion.';
  end;

  -- This row lock serializes repeated conversions of one source. The unique
  -- (source_type, source_id) history key is the final duplicate guard.
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',v_source_table)
    into v_source_row using p_source_id;
  if v_source_row is null then
    raise exception using errcode='P0002', message='Source report was not found.';
  end if;
  v_trip_id := nullif(v_source_row->>'trip_id','')::uuid;
  v_stop_id := nullif(v_source_row->>'trip_stop_id','')::uuid;
  if v_trip_id is null then
    raise exception using errcode='23514', message='Source report has no trip scope; conversion is not allowed.';
  end if;

  -- A receipt write that started after the first pass may hold its receipt row
  -- while waiting for this parent. Never wait for that row while holding the
  -- parent: NOWAIT converts the cycle into a retryable transaction failure.
  -- A new, uncommitted receipt INSERT is invisible here but waits for this
  -- parent; after conversion commits, its receipt guard sees the ledger row
  -- and rejects attachment to the converted source.
  begin
    perform r.id from public.report_receipts r
      where to_jsonb(r)->>v_source_receipt_col=p_source_id::text
      order by r.id for update nowait;
  exception when lock_not_available then
    raise exception using errcode='40001',
      message='A receipt is being changed for this report. Retry the conversion.';
  end;

  -- Read and lock the exact stop named by the source. The full stop image is
  -- retained because Unloading timestamps and remarks live there.
  if v_stop_id is not null then
    select to_jsonb(s) into v_source_stop
    from public.trip_stops s where s.id=v_stop_id and s.trip_id=v_trip_id for share;
    if not found then
      raise exception using errcode='23514', message='Source stop does not belong to the source trip.';
    end if;
  end if;
  if p_source_type='LOADING' and p_target_type='UNLOADING' then
    raise exception using errcode='22023', message='LOADING has no stop association or Unloading timeline to map; this conversion is not supported.';
  end if;
  if p_target_type='UNLOADING' then
    if v_stop_id is null then
      raise exception using errcode='22023', message='Conversion to UNLOADING requires an existing source stop; no stop will be inferred.';
    end if;
    if nullif(v_source_stop->>'arrival_time','') is null
       and nullif(v_source_stop->>'start_unloading_time','') is null
       and nullif(v_source_stop->>'finish_unloading_time','') is null then
      raise exception using errcode='22023', message='The source stop has no saved arrival or unloading timestamp; a meaningful UNLOADING target cannot be created.';
    end if;
  end if;

  -- Validate scope and ID generation assumptions before attempting an insert.
  if not exists (
    select 1 from pg_attribute a where a.attrelid=v_target_relation
      and a.attname='trip_id' and a.atttypid='uuid'::regtype and a.attnotnull
      and a.attnum>0 and not a.attisdropped
  ) then
    raise exception using errcode='55000', message='Target schema must provide a required UUID trip_id column; conversion is disabled.';
  end if;
  if not exists (
    select 1 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=v_target_relation and a.attname='id' and a.atttypid='uuid'::regtype
      and (a.attidentity<>'' or a.attgenerated<>'' or d.adbin is not null)
  ) then
    raise exception using errcode='55000', message='Target schema does not generate a UUID id; conversion is disabled.';
  end if;
  if p_target_type='UNLOADING' and not exists (
    select 1 from pg_attribute a where a.attrelid=v_target_relation
      and a.attname='trip_stop_id' and a.atttypid='uuid'::regtype and a.attnotnull
  ) then
    raise exception using errcode='55000', message='Unloading target schema must require UUID trip_stop_id; conversion is disabled.';
  end if;
  if p_target_type in ('BACKLOAD','OFFLOAD') and not exists (
    select 1 from pg_attribute a where a.attrelid=v_target_relation
      and a.attname='trip_stop_id' and a.atttypid='uuid'::regtype and not a.attnotnull
  ) then
    raise exception using errcode='55000', message='Cargo target schema must provide optional UUID trip_stop_id; conversion is disabled.';
  end if;

  -- Discover the source child FK and snapshot complete rows. Backload and
  -- Offload child schemas differ (including Offload item reason), so rows are
  -- deliberately not moved or coerced into the target item table. They remain
  -- attached to the immutable source and are retained in the history snapshot.
  select count(*),min(a.attname) into v_item_fk_count,v_item_fk
  from pg_constraint c
  join pg_class child on child.oid=c.conrelid
  join pg_namespace ns on ns.oid=child.relnamespace
  join pg_attribute a on a.attrelid=child.oid and a.attnum=c.conkey[1]
  where c.contype='f' and ns.nspname='public'
    and child.relname=case p_source_type when 'BACKLOAD' then 'backload_items' when 'OFFLOAD' then 'offload_items' else '' end
    and a.attname=case p_source_type when 'BACKLOAD' then 'backload_id' when 'OFFLOAD' then 'offload_id' else '' end
    and array_length(c.conkey,1)=1 and array_length(c.confkey,1)=1
    and c.confrelid=to_regclass(format('public.%I',v_source_table))
    and c.confkey[1]=(select parent_id.attnum from pg_attribute parent_id
      where parent_id.attrelid=to_regclass(format('public.%I',v_source_table)) and parent_id.attname='id'
        and parent_id.attnum>0 and not parent_id.attisdropped);
  if p_source_type in ('BACKLOAD','OFFLOAD') and v_item_fk_count<>1 then
    raise exception using errcode='55000', message='Could not identify exactly one source cargo item parent relationship; conversion is disabled.';
  end if;
  if v_item_fk is not null then
    execute format('select coalesce(jsonb_agg(to_jsonb(i) order by i.id), ''[]''::jsonb) from public.%I i where i.%I=$1',
      case p_source_type when 'BACKLOAD' then 'backload_items' when 'OFFLOAD' then 'offload_items' else '' end,v_item_fk)
      into v_items using p_source_id;
  elsif p_source_type in ('BACKLOAD','OFFLOAD') then
    raise exception using errcode='55000', message='Could not verify the cargo child relationship; conversion is disabled.';
  end if;
  -- Snapshot locked receipts including every metadata column before transfer.
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into v_receipts
  from public.report_receipts r where to_jsonb(r)->>v_source_receipt_col=p_source_id::text;
  if exists (
    select 1 from public.report_receipts r
    where to_jsonb(r)->>v_source_receipt_col=p_source_id::text
      and num_nonnulls(r.loading_report_id,r.unloading_report_id,r.backload_id,r.offload_id)<>1
  ) then
    raise exception using errcode='23514', message='A source receipt does not have exactly one parent; conversion was rejected.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_receipts) receipt
    where receipt->>'trip_id' is distinct from v_trip_id::text
       or (p_target_type='UNLOADING' and receipt->>'trip_stop_id' is distinct from v_stop_id::text)
  ) then
    raise exception using errcode='23514', message='Receipt trip/stop scope cannot be preserved for this target; conversion was rejected.';
  end if;

  -- Check exact receipt FK column correspondence (not merely that a column
  -- happens to participate in some FK to the target table).
  v_source_columns := case p_source_type
    when 'UNLOADING' then array['unloading_report_id','trip_stop_id','trip_id']
    when 'LOADING' then array['loading_report_id','trip_id']
    when 'BACKLOAD' then array['backload_id','trip_id']
    else array['offload_id','trip_id'] end;
  v_parent_columns := case p_source_type when 'UNLOADING' then array['id','trip_stop_id','trip_id'] else array['id','trip_id'] end;
  select exists (
    select 1 from pg_constraint c where c.contype='f' and c.conrelid='public.report_receipts'::regclass
      and c.confrelid=to_regclass(format('public.%I',v_source_table))
      and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality)
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=v_source_columns
      and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.confkey) with ordinality k(attnum,ordinality)
        join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)=v_parent_columns
  ) into v_source_fk;
  v_source_columns := case p_target_type
    when 'UNLOADING' then array['unloading_report_id','trip_stop_id','trip_id']
    when 'LOADING' then array['loading_report_id','trip_id']
    when 'BACKLOAD' then array['backload_id','trip_id']
    else array['offload_id','trip_id'] end;
  v_parent_columns := case p_target_type when 'UNLOADING' then array['id','trip_stop_id','trip_id'] else array['id','trip_id'] end;
  select exists (
    select 1 from pg_constraint c where c.contype='f' and c.conrelid='public.report_receipts'::regclass
      and c.confrelid=to_regclass(format('public.%I',v_target_table))
      and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality)
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=v_source_columns
      and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.confkey) with ordinality k(attnum,ordinality)
        join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)=v_parent_columns
  ) into v_target_fk;
  if not coalesce(v_source_fk,false) or not coalesce(v_target_fk,false) then
    raise exception using errcode='55000', message='The exact source or target receipt scope foreign key is missing; conversion is disabled.';
  end if;
  if not exists (select 1 from pg_attribute a where a.attrelid='public.report_receipts'::regclass and a.attname=v_source_receipt_col and a.atttypid='uuid'::regtype)
     or not exists (select 1 from pg_attribute a where a.attrelid='public.report_receipts'::regclass and a.attname=v_target_receipt_col and a.atttypid='uuid'::regtype) then
    raise exception using errcode='55000', message='Receipt parent columns are missing or are not UUIDs; conversion is disabled.';
  end if;

  -- Build an explicit target mapping. Only source trip/stop scope is carried;
  -- event-specific fields are re-entered for the target and old values remain
  -- in source_snapshot. Target type dictates the permitted input fields.
  v_target_row := jsonb_build_object('trip_id',v_trip_id);
  if p_target_type='UNLOADING' or (p_target_type in ('BACKLOAD','OFFLOAD') and v_stop_id is not null) then
    v_target_row := v_target_row || jsonb_build_object('trip_stop_id',v_stop_id);
  end if;
  if p_target_type='LOADING' then
    if exists (select 1 from jsonb_object_keys(p_target_fields) f(key) where key not in ('warehouse_arrival_at','loading_start_at','loading_finished_at')) then
      raise exception using errcode='22023', message='Only Loading timestamp fields may be supplied for a LOADING target.';
    end if;
    if not (p_target_fields ?| array['warehouse_arrival_at','loading_start_at','loading_finished_at'])
       or not exists (select 1 from jsonb_each(p_target_fields) f where f.key in ('warehouse_arrival_at','loading_start_at','loading_finished_at') and jsonb_typeof(f.value)='string' and nullif(btrim(f.value #>> '{}'),'') is not null) then
      raise exception using errcode='22023', message='Supply at least one nonempty target Loading timestamp; source timestamps are not reinterpreted.';
    end if;
    foreach v_field in array array['warehouse_arrival_at','loading_start_at','loading_finished_at'] loop
      if p_target_fields ? v_field then
        select a.atttypid into v_target_type_oid from pg_attribute a where a.attrelid=v_target_relation and a.attname=v_field and a.attnum>0 and not a.attisdropped;
        if v_target_type_oid is distinct from 'timestamp with time zone'::regtype then
          raise exception using errcode='55000', message=format('LOADING target field %s is missing or is not timestamptz; conversion is disabled.',v_field);
        end if;
      end if;
    end loop;
    v_target_row := v_target_row || p_target_fields;
  elsif p_target_type in ('BACKLOAD','OFFLOAD') then
    if exists (select 1 from jsonb_object_keys(p_target_fields) f(key) where key not in ('reason','number_of_boxes','comments')) then
      raise exception using errcode='22023', message='Only reason, number_of_boxes, and comments may be supplied for a cargo target.';
    end if;
    if jsonb_typeof(p_target_fields->'reason') is distinct from 'string' or nullif(btrim(p_target_fields->>'reason'),'') is null then
      raise exception using errcode='22023', message='Supply a new nonempty reason for the target cargo report; source reason semantics are not assumed equivalent.';
    end if;
    if p_target_fields ? 'number_of_boxes' and p_target_fields->'number_of_boxes' <> 'null'::jsonb then
      if jsonb_typeof(p_target_fields->'number_of_boxes') <> 'number'
         or (p_target_fields->>'number_of_boxes')::numeric < 0
         or (p_target_fields->>'number_of_boxes')::numeric <> trunc((p_target_fields->>'number_of_boxes')::numeric) then
        raise exception using errcode='22023', message='number_of_boxes must be a non-negative whole number or null.';
      end if;
    end if;
    foreach v_field in array array['reason','number_of_boxes','comments'] loop
      if p_target_fields ? v_field then
        select a.atttypid into v_target_type_oid from pg_attribute a where a.attrelid=v_target_relation and a.attname=v_field and a.attnum>0 and not a.attisdropped;
        if v_target_type_oid is null then
          raise exception using errcode='55000', message=format('Cargo target field %s is missing; conversion is disabled.',v_field);
        end if;
        if v_field in ('reason','comments') and (select t.typcategory from pg_type t where t.oid=v_target_type_oid) <> 'S' then
          raise exception using errcode='55000', message=format('Cargo target field %s is not a string column; conversion is disabled.',v_field);
        end if;
        if v_field='number_of_boxes' and v_target_type_oid not in ('smallint'::regtype,'integer'::regtype,'bigint'::regtype,'numeric'::regtype) then
          raise exception using errcode='55000', message='Cargo target number_of_boxes is not a numeric column; conversion is disabled.';
        end if;
      end if;
    end loop;
    v_target_row := v_target_row || p_target_fields;
  elsif p_target_type='UNLOADING' and p_target_fields <> '{}'::jsonb then
    raise exception using errcode='22023', message='UNLOADING timestamps and remarks belong to the existing trip_stops row and cannot be overridden during conversion.';
  end if;

  -- Validate fields, defaults, and every required target column before insert.
  if exists (
    select 1 from jsonb_object_keys(v_target_row) f(key)
    where not exists (select 1 from pg_attribute a where a.attrelid=v_target_relation and a.attname=f.key and a.attnum>0 and not a.attisdropped)
  ) then
    raise exception using errcode='55000', message='A mapped target field is absent from the target report schema; conversion is disabled.';
  end if;
  if exists (
    select 1 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=v_target_relation and a.attnum>0 and not a.attisdropped and a.attnotnull
      and d.adbin is null and a.attidentity='' and a.attgenerated=''
      and (not (v_target_row ? a.attname) or v_target_row->a.attname='null'::jsonb)
  ) then
    raise exception using errcode='22023', message='A required target field has no supplied nonnull value or database default; conversion is disabled.';
  end if;

  -- Loading and Unloading uniqueness is an invariant. Verify its exact
  -- one-column index before relying on it; concurrent calls are finally
  -- arbitrated by that unique index. Cargo scope has no assumed uniqueness;
  -- any actual target constraint is enforced by INSERT below.
  if p_target_type='LOADING' then
    if not exists (select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attname='trip_id'
      where i.indrelid=v_target_relation and i.indisunique and i.indpred is null and i.indnkeyatts=1 and i.indkey[0]=a.attnum) then
      raise exception using errcode='55000', message='Schema is missing the required unique Loading-per-trip constraint; conversion is disabled.';
    end if;
    if exists (select 1 from public.loading_reports where trip_id=v_trip_id) then
      raise exception using errcode='23505', message='A LOADING report already exists for this trip.';
    end if;
  elsif p_target_type='UNLOADING' then
    if not exists (select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attname='trip_stop_id'
      where i.indrelid=v_target_relation and i.indisunique and i.indpred is null and i.indnkeyatts=1 and i.indkey[0]=a.attnum) then
      raise exception using errcode='55000', message='Schema is missing the required unique Unloading-per-stop constraint; conversion is disabled.';
    end if;
    if exists (select 1 from public.unloading_reports where trip_stop_id=v_stop_id) then
      raise exception using errcode='23505', message='An UNLOADING report already exists for this stop.';
    end if;
  end if;

  select string_agg(format('%I',a.attname),',' order by a.attnum),
         string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',v_target_table,a.attname),',' order by a.attnum)
    into v_insert_cols,v_insert_expr
  from pg_attribute a where a.attrelid=v_target_relation and a.attnum>0 and not a.attisdropped
    and v_target_row ? a.attname;
  if v_insert_cols is null then
    raise exception using errcode='55000', message='Target report schema has no insertable mapped fields.';
  end if;
  execute format('insert into public.%I (%s) select %s returning id',v_target_table,v_insert_cols,v_insert_expr)
    into v_target_id using v_target_row;
  if v_target_id is null then
    raise exception using errcode='55000', message='Target report did not receive a generated UUID; conversion was rolled back.';
  end if;

  v_snapshot := jsonb_build_object(
    'parent',v_source_row,
    'stop',v_source_stop,
    'receipts',v_receipts,
    'mapping_policy','Only trip/stop scope is copied automatically. Target event-specific data is explicitly supplied or reused from the existing Unloading stop timeline. Unmatched source values remain in this snapshot.'
  );

  -- Reparent only the receipt FK. The receipt guard and existing scope/FK
  -- triggers run normally. Receipt IDs and all metadata remain untouched.
  execute format('update public.report_receipts set %I=$1, %I=null where %I=$2',
    v_target_receipt_col,v_source_receipt_col,v_source_receipt_col)
    using v_target_id,p_source_id;

  insert into public.operations_report_conversions
    (source_type,source_id,target_type,target_id,trip_id,trip_stop_id,actor_profile_id,source_snapshot,source_items_snapshot)
  values (p_source_type,p_source_id,p_target_type,v_target_id,v_trip_id,
    nullif(v_source_row->>'trip_stop_id','')::uuid,p_actor_profile_id,v_snapshot,v_items);

  return jsonb_build_object('source_type',p_source_type,'source_id',p_source_id,
    'target_type',p_target_type,'target_id',v_target_id,'trip_id',v_trip_id,
    'trip_stop_id',nullif(v_source_row->>'trip_stop_id',''));
end;
$$;

-- CREATE OR REPLACE preserves an existing function's owner, while a newly
-- created function is owned by the migration executor. Validate the effective
-- owner of every SECURITY DEFINER function; do not assume those identities are
-- the same. This fails closed if an existing function has an unsafe owner.
revoke all on function public.convert_operations_report_v1(text,uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.convert_operations_report_v1(text,uuid,text,uuid,jsonb) to service_role;
revoke grant option for execute on function public.convert_operations_report_v1(text,uuid,text,uuid,jsonb) from service_role;

-- All writes of a converted source are rejected at the database boundary. This
-- supplements application checks and also covers direct service-role mutation
-- paths and concurrent writes waiting on the source-row lock.
create or replace function public.guard_converted_operations_report_source_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.operations_report_conversions c where c.source_type=TG_ARGV[0] and c.source_id=OLD.id) then
    raise exception using errcode='55000', message='Converted source report is immutable.';
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.guard_converted_operations_report_source_v1() from public, anon, authenticated, service_role;

drop trigger if exists converted_loading_report_immutable_trg on public.loading_reports;
create trigger converted_loading_report_immutable_trg before update or delete on public.loading_reports
for each row execute function public.guard_converted_operations_report_source_v1('LOADING');
drop trigger if exists converted_unloading_report_immutable_trg on public.unloading_reports;
create trigger converted_unloading_report_immutable_trg before update or delete on public.unloading_reports
for each row execute function public.guard_converted_operations_report_source_v1('UNLOADING');
drop trigger if exists converted_backload_immutable_trg on public.backloads;
create trigger converted_backload_immutable_trg before update or delete on public.backloads
for each row execute function public.guard_converted_operations_report_source_v1('BACKLOAD');
drop trigger if exists converted_offload_immutable_trg on public.offloads;
create trigger converted_offload_immutable_trg before update or delete on public.offloads
for each row execute function public.guard_converted_operations_report_source_v1('OFFLOAD');

-- Receipt UPDATEs validate both parent references. During conversion the
-- source ledger row is inserted after receipt transfer, allowing that atomic
-- handoff; later detaches from converted sources are rejected. The NEW parent
-- lock precedes the checked-in scope trigger's advisory lock.
create or replace function public.guard_converted_report_receipt_parent_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_parent_id uuid;
  v_old_parent_type text;
  v_parent_id uuid;
  v_parent_type text;
  v_parent_table text;
  v_locked_id uuid;
begin
  if TG_OP='UPDATE' then
    if num_nonnulls(OLD.loading_report_id,OLD.unloading_report_id,OLD.backload_id,OLD.offload_id)<>1 then
      raise exception using errcode='23514', message='An existing report receipt must reference exactly one report parent.';
    end if;
    if OLD.loading_report_id is not null then v_old_parent_id:=OLD.loading_report_id; v_old_parent_type:='LOADING';
    elsif OLD.unloading_report_id is not null then v_old_parent_id:=OLD.unloading_report_id; v_old_parent_type:='UNLOADING';
    elsif OLD.backload_id is not null then v_old_parent_id:=OLD.backload_id; v_old_parent_type:='BACKLOAD';
    else v_old_parent_id:=OLD.offload_id; v_old_parent_type:='OFFLOAD'; end if;
    -- During the conversion RPC this is checked before the ledger row is
    -- inserted, so its atomic source -> target receipt handoff is allowed.
    -- Later attempts to detach a receipt from a converted source are rejected.
    if exists (select 1 from public.operations_report_conversions c
      where c.source_type=v_old_parent_type and c.source_id=v_old_parent_id) then
      raise exception using errcode='55000', message='A receipt cannot be detached from a converted source report.';
    end if;
  end if;
  if num_nonnulls(NEW.loading_report_id,NEW.unloading_report_id,NEW.backload_id,NEW.offload_id)<>1 then
    raise exception using errcode='23514', message='A report receipt must reference exactly one report parent.';
  end if;
  if NEW.loading_report_id is not null then v_parent_id:=NEW.loading_report_id; v_parent_type:='LOADING'; v_parent_table:='loading_reports';
  elsif NEW.unloading_report_id is not null then v_parent_id:=NEW.unloading_report_id; v_parent_type:='UNLOADING'; v_parent_table:='unloading_reports';
  elsif NEW.backload_id is not null then v_parent_id:=NEW.backload_id; v_parent_type:='BACKLOAD'; v_parent_table:='backloads';
  else v_parent_id:=NEW.offload_id; v_parent_type:='OFFLOAD'; v_parent_table:='offloads'; end if;
  execute format('select id from public.%I where id=$1 for update',v_parent_table) into v_locked_id using v_parent_id;
  if v_locked_id is null then
    raise exception using errcode='23503', message='Receipt report parent does not exist.';
  end if;
  if exists (select 1 from public.operations_report_conversions c where c.source_type=v_parent_type and c.source_id=v_parent_id) then
    raise exception using errcode='55000', message='A converted source report cannot receive or retain new receipts.';
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_converted_report_receipt_parent_v1() from public, anon, authenticated, service_role;
drop trigger if exists converted_receipt_parent_immutable_trg on public.report_receipts;
create trigger converted_receipt_parent_immutable_trg before insert or update on public.report_receipts
for each row execute function public.guard_converted_report_receipt_parent_v1();

-- Prevent a post-conversion item insert/update/delete from changing the
-- source's audited cargo contents. Child rows remain under the source parent
-- and are also copied to the conversion snapshot; this closes item-write races
-- and keeps the retained source history stable.
create or replace function public.guard_converted_operations_report_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_parent_column text := TG_ARGV[0];
  v_parent_type text := TG_ARGV[1];
  v_parent_table text := case TG_ARGV[1] when 'BACKLOAD' then 'backloads' else 'offloads' end;
  v_parent_ids uuid[];
  v_id uuid;
  v_locked_id uuid;
begin
  if TG_OP='INSERT' then v_parent_ids:=array[nullif(to_jsonb(NEW)->>v_parent_column,'')::uuid];
  elsif TG_OP='DELETE' then v_parent_ids:=array[nullif(to_jsonb(OLD)->>v_parent_column,'')::uuid];
  else v_parent_ids:=array[nullif(to_jsonb(OLD)->>v_parent_column,'')::uuid,nullif(to_jsonb(NEW)->>v_parent_column,'')::uuid]; end if;
  for v_id in select distinct parents.parent_id from unnest(v_parent_ids) as parents(parent_id)
    where parents.parent_id is not null order by parents.parent_id loop
    execute format('select id from public.%I where id=$1 for update',v_parent_table) into v_locked_id using v_id;
    if exists (select 1 from public.operations_report_conversions c where c.source_type=v_parent_type and c.source_id=v_id) then
      raise exception using errcode='55000', message='Items belonging to a converted source report are immutable.';
    end if;
  end loop;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.guard_converted_operations_report_item_v1() from public, anon, authenticated, service_role;
drop trigger if exists converted_backload_item_immutable_trg on public.backload_items;
create trigger converted_backload_item_immutable_trg before insert or update or delete on public.backload_items
for each row execute function public.guard_converted_operations_report_item_v1('backload_id','BACKLOAD');
drop trigger if exists converted_offload_item_immutable_trg on public.offload_items;
create trigger converted_offload_item_immutable_trg before insert or update or delete on public.offload_items
for each row execute function public.guard_converted_operations_report_item_v1('offload_id','OFFLOAD');

-- Once an Unloading source is converted, protect the fields used to identify
-- its stop and the fields that define its stop/unloading meaning. Generic
-- operational fields not in this list remain editable. The identity check
-- still catches an attempt to detach the stop by changing id or trip_id.
create or replace function public.guard_converted_unloading_stop_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_converted boolean;
  v_column text;
  v_protected text[] := array['id','trip_id','stop_sequence','store_id','customer_id','delivery_status','arrival_time','start_unloading_time','finish_unloading_time','departure_time','remarks'];
begin
  select exists (
    select 1 from public.unloading_reports ur
    join public.operations_report_conversions c on c.source_type='UNLOADING' and c.source_id=ur.id
    where ur.trip_stop_id=OLD.id
  ) into v_converted;
  if not v_converted then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP='DELETE' then
    raise exception using errcode='55000', message='Stop identity or timeline belongs to a converted Unloading source.';
  end if;
  foreach v_column in array v_protected loop
    if to_jsonb(NEW)->v_column is distinct from to_jsonb(OLD)->v_column then
      raise exception using errcode='55000', message=format('Stop field %s belongs to a converted Unloading source and is immutable.',v_column);
    end if;
  end loop;
  return NEW;
end;
$$;
revoke all on function public.guard_converted_unloading_stop_v1() from public, anon, authenticated, service_role;
drop trigger if exists converted_unloading_stop_immutable_trg on public.trip_stops;
create trigger converted_unloading_stop_immutable_trg before update or delete on public.trip_stops
for each row execute function public.guard_converted_unloading_stop_v1();

-- Verify each SECURITY DEFINER routine's actual owner after CREATE OR REPLACE.
-- Function ownership is preserved on replacement, so validating current_user
-- alone would not prove that a pre-existing routine can bypass report RLS.
do $$
declare
  v_signature text;
  v_function regprocedure;
  v_owner name;
  v_owner_oid oid;
  v_can_bypass boolean;
  v_table text;
  v_required_signatures text[] := array[
    'public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)',
    'public.guard_converted_operations_report_source_v1()',
    'public.guard_converted_report_receipt_parent_v1()',
    'public.guard_converted_operations_report_item_v1()',
    'public.guard_converted_unloading_stop_v1()'
  ];
begin
  foreach v_signature in array v_required_signatures loop
    v_function := to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Required conversion function % is missing',v_signature;
    end if;
    select r.rolname,r.oid,(r.rolsuper or r.rolbypassrls)
      into v_owner,v_owner_oid,v_can_bypass
    from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=v_function::oid;
    if v_owner is null or not coalesce(v_can_bypass,false) then
      raise exception 'SECURITY DEFINER function % is owned by a role without superuser/BYPASSRLS (%); migration is unsafe',v_signature,v_owner;
    end if;
    if not has_schema_privilege(v_owner,'public','USAGE') then
      raise exception 'SECURITY DEFINER function owner % lacks USAGE on public',v_owner;
    end if;
    if not has_table_privilege(v_owner,'public.operations_report_conversions','SELECT') then
      raise exception 'SECURITY DEFINER function owner % lacks SELECT on operations_report_conversions',v_owner;
    end if;
    if v_signature='public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)' then
      if not has_function_privilege('service_role',v_function,'EXECUTE') then
        raise exception 'service_role must be able to execute %',v_signature;
      end if;
      if exists (
        select 1 from pg_proc p,
          lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=v_function::oid
          and (
            acl.grantee not in (p.proowner,(select oid from pg_roles where rolname='service_role'))
            or (acl.grantee=(select oid from pg_roles where rolname='service_role') and acl.is_grantable)
          )
      ) then
        raise exception 'Conversion RPC % has an EXECUTE grant beyond its owner and service_role',v_signature;
      end if;
    else
      if exists (
        select 1 from pg_proc p,
          lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=v_function::oid and acl.grantee<>p.proowner
      ) then
        raise exception 'Guard function % has a direct EXECUTE grant beyond its owner',v_signature;
      end if;
    end if;
  end loop;

  select r.rolname into v_owner from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure('public.convert_operations_report_v1(text,uuid,text,uuid,jsonb)')::oid;
  if not has_table_privilege(v_owner,'public.report_receipts','SELECT')
     or not has_table_privilege(v_owner,'public.report_receipts','UPDATE')
     or not has_table_privilege(v_owner,'public.operations_report_conversions','INSERT')
     or not has_table_privilege(v_owner,'public.profiles','SELECT')
     or not has_table_privilege(v_owner,'public.trip_stops','SELECT')
     or not has_table_privilege(v_owner,'public.trip_stops','UPDATE')
     or not has_table_privilege(v_owner,'public.backload_items','SELECT')
     or not has_table_privilege(v_owner,'public.offload_items','SELECT') then
    raise exception 'Conversion function owner % lacks a required report, receipt, profile, stop, item, or ledger privilege',v_owner;
  end if;
  foreach v_table in array array['loading_reports','unloading_reports','backloads','offloads'] loop
    if not has_table_privilege(v_owner,format('public.%I',v_table),'SELECT')
       or not has_table_privilege(v_owner,format('public.%I',v_table),'INSERT')
       or not has_table_privilege(v_owner,format('public.%I',v_table),'UPDATE') then
      raise exception 'Conversion function owner % lacks required privileges on public.%',v_owner,v_table;
    end if;
  end loop;

  select r.rolname into v_owner from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure('public.guard_converted_report_receipt_parent_v1()')::oid;
  foreach v_table in array array['loading_reports','unloading_reports','backloads','offloads'] loop
    if not has_table_privilege(v_owner,format('public.%I',v_table),'SELECT')
       or not has_table_privilege(v_owner,format('public.%I',v_table),'UPDATE') then
      raise exception 'Receipt guard owner % lacks locked parent read privileges on public.%',v_owner,v_table;
    end if;
  end loop;

  select r.rolname into v_owner from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure('public.guard_converted_operations_report_item_v1()')::oid;
  if not has_table_privilege(v_owner,'public.backloads','SELECT')
     or not has_table_privilege(v_owner,'public.backloads','UPDATE')
     or not has_table_privilege(v_owner,'public.offloads','SELECT')
     or not has_table_privilege(v_owner,'public.offloads','UPDATE') then
    raise exception 'Cargo item guard owner % lacks locked parent read privileges',v_owner;
  end if;

  select r.rolname into v_owner from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure('public.guard_converted_unloading_stop_v1()')::oid;
  if not has_table_privilege(v_owner,'public.unloading_reports','SELECT') then
    raise exception 'Unloading stop guard owner % lacks SELECT on unloading_reports',v_owner;
  end if;
end;
$$;

commit;
