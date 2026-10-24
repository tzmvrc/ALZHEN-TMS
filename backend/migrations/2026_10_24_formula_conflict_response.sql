-- Use an explicit HTTP conflict, not a serialization failure that PostgREST
-- can retry automatically. Preserve the full function body, ACL and graph guards.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.save_spreadsheet_formulas_v1(uuid,text,jsonb)'::regprocedure);
 if position('Formula version conflict' in definition)=0 then raise exception 'Unexpected formula RPC definition'; end if;
 if position('ERRCODE=''40001''' in definition)>0 then
  execute replace(definition,'ERRCODE=''40001''','ERRCODE=''PT409''');
 elsif position('ERRCODE=''PT409''' in definition)=0 then
  raise exception 'Unexpected formula conflict code';
 end if;
end $migration$;
notify pgrst,'reload schema';
