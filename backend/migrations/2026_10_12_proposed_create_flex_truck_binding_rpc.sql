-- PROPOSAL ONLY. Apply only after reviewing and applying
-- 2026_10_11_proposed_flex_source_bindings.sql.
--
-- This narrowly scoped RPC atomically creates a CUSTOM flex_rows record and
-- its flex_source_bindings association. It never writes to public.trucks.
-- The authenticated backend must perform ADMIN/STAFF and per-table permission
-- checks before calling it, and must derive p_actor_profile_id from its
-- authenticated profile. Direct browser execution is revoked below.

CREATE OR REPLACE FUNCTION public.create_flex_truck_binding(
  p_table_id uuid,
  p_truck_id uuid,
  p_actor_profile_id uuid,
  p_request_id text DEFAULT NULL
)
RETURNS TABLE (
  binding_id uuid,
  row_id uuid,
  row_version integer,
  row_position bigint,
  row_created_at timestamptz,
  created boolean,
  restored boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_truck_id uuid;
  v_table_kind text;
  v_table_archived_at timestamptz;
  v_binding_id uuid;
  v_row_id uuid;
  v_row_kind text;
  v_row_archived_at timestamptz;
  v_row_version integer;
  v_row_position bigint;
  v_row_created_at timestamptz;
  v_next_position bigint;
BEGIN
  -- Serialize attempts to bind this truck so the table/truck unique index
  -- returns the existing binding on retries instead of leaving an extra row.
  SELECT t.id INTO v_truck_id
  FROM public.trucks AS t
  WHERE t.id = p_truck_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Truck not found' USING ERRCODE = 'P0002';
  END IF;

  -- Lock the table while checking its kind and allocating a row position.
  SELECT t.table_kind, t.archived_at
    INTO v_table_kind, v_table_archived_at
  FROM public.flex_tables AS t
  WHERE t.id = p_table_id
  FOR UPDATE;
  IF NOT FOUND OR v_table_kind IS DISTINCT FROM 'CUSTOM' OR v_table_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active custom flexible table not found' USING ERRCODE = 'P0002';
  END IF;

  -- Existing bindings are idempotent. Restore their archived custom row in
  -- this same transaction so the unique truck binding can be reused safely.
  SELECT b.id, b.row_id, r.row_kind, r.archived_at, r.version, r.position, r.created_at
    INTO v_binding_id, v_row_id, v_row_kind, v_row_archived_at,
         v_row_version, v_row_position, v_row_created_at
  FROM public.flex_source_bindings AS b
  JOIN public.flex_rows AS r ON r.id = b.row_id AND r.table_id = b.table_id
  WHERE b.table_id = p_table_id AND b.source_entity_id = p_truck_id
  FOR UPDATE OF b, r;

  IF FOUND THEN
    IF v_row_kind IS DISTINCT FROM 'CUSTOM' THEN
      RAISE EXCEPTION 'Truck binding does not reference a custom row' USING ERRCODE = '23514';
    END IF;
    IF v_row_archived_at IS NOT NULL THEN
      UPDATE public.flex_rows AS r
      SET archived_at = NULL,
          version = r.version + 1,
          updated_at = now()
      WHERE r.id = v_row_id AND r.table_id = p_table_id
      RETURNING r.version, r.position, r.created_at
        INTO v_row_version, v_row_position, v_row_created_at;

      INSERT INTO public.flex_audit_events (
        table_id, actor_profile_id, action, entity_type, entity_id,
        before_data, after_data, request_id
      ) VALUES (
        p_table_id, p_actor_profile_id, 'restore-truck-custom-row', 'ROW', v_row_id,
        jsonb_build_object('truck_id', p_truck_id, 'archived_at', v_row_archived_at),
        jsonb_build_object('truck_id', p_truck_id, 'binding_id', v_binding_id, 'archived_at', NULL),
        p_request_id
      );
      RETURN QUERY SELECT v_binding_id, v_row_id, v_row_version, v_row_position,
                          v_row_created_at, false, true;
      RETURN;
    END IF;

    RETURN QUERY SELECT v_binding_id, v_row_id, v_row_version, v_row_position,
                        v_row_created_at, false, false;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(r.position), -1) + 1 INTO v_next_position
  FROM public.flex_rows AS r
  WHERE r.table_id = p_table_id AND r.row_kind = 'CUSTOM' AND r.archived_at IS NULL;

  INSERT INTO public.flex_rows (
    table_id, row_kind, source_entity_type, source_entity_id,
    position, created_by
  ) VALUES (
    p_table_id, 'CUSTOM', NULL, NULL, v_next_position, p_actor_profile_id
  )
  RETURNING id, version, position, created_at
    INTO v_row_id, v_row_version, v_row_position, v_row_created_at;

  INSERT INTO public.flex_source_bindings (table_id, row_id, source_entity_id)
  VALUES (p_table_id, v_row_id, p_truck_id)
  RETURNING id INTO v_binding_id;

  INSERT INTO public.flex_audit_events (
    table_id, actor_profile_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) VALUES (
    p_table_id, p_actor_profile_id, 'bind-truck-custom-row', 'ROW', v_row_id,
    NULL,
    jsonb_build_object('truck_id', p_truck_id, 'binding_id', v_binding_id),
    p_request_id
  );

  RETURN QUERY SELECT v_binding_id, v_row_id, v_row_version, v_row_position,
                      v_row_created_at, true, false;
END;
$$;

REVOKE ALL ON FUNCTION public.create_flex_truck_binding(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_flex_truck_binding(uuid, uuid, uuid, text)
  TO service_role;
