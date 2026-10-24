-- Access remains enforced by getTableAccess; this projection is service-role only.
create or replace view public.v_flex_row_search as
select r.*, coalesce((select string_agg(concat_ws(' ',c.value #>> '{}',c.formula->>'expression'),' ')
from public.flex_cells c join public.flex_columns col on col.id=c.column_id
where c.row_id=r.id and col.table_id=r.table_id and not col.is_archived),'') as _search_text
from public.flex_rows r where r.row_kind='CUSTOM' and r.archived_at is null;
revoke all on public.v_flex_row_search from public,anon,authenticated;
grant select on public.v_flex_row_search to service_role;
notify pgrst,'reload schema';
