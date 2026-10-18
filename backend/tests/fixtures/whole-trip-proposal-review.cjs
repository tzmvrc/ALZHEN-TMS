// Disposable-only proposal idempotency: no operational row changes on install.
const {execFileSync}=require('node:child_process'),{readFileSync}=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const database=process.argv[2],directory=process.argv[3];assert.match(database??'',/^whole_trip_[a-z0-9_]+$/);assert.match(path.basename(directory??''),/^alzhen-planned-routes-[a-f0-9]+$/);
function query(sql){return execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','55443','-U','fixture','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-f','-'],{input:sql,encoding:'utf8',env:{...process.env,PGCLIENTENCODING:'UTF8'},windowsHide:true}).trim();}
assert.equal(path.normalize(query('SHOW data_directory')).toLowerCase(),path.normalize(directory).toLowerCase());
const tables=['trips','trip_stops','trip_line_items','pod_records','trip_images','offloads','backloads','driver_trip_updates','transaction_deletion_jobs','pod_review_events','trip_tracking_locations','trip_route_cache'];
const snapshot=()=>tables.map(t=>query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.${t} t`));
const metadata=()=>query("SELECT json_build_object('owner',proowner,'acl',proacl,'settings',proconfig,'definer',prosecdef,'arguments',proargnames) FROM pg_proc WHERE oid='delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure");
const before=snapshot(),acl=metadata(),helper=query("SELECT md5(replace(pg_get_functiondef('delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),chr(13),''))");
for(let i=0;i<2;i++)for(const file of ['backend/migrations/2026_11_08_proposed_driver_update_parent.sql','backend/migrations/2026_11_07_proposed_whole_trip_deletion.sql'])query(readFileSync(file,'utf8'));
assert.deepEqual(snapshot(),before);assert.equal(query("SELECT md5(replace(pg_get_functiondef('delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),chr(13),''))"),'91fd1eaf57d95d3f646b58d5d2d4bdd6');assert.ok(['9d11efef4875f0d32256d589db30a9e6','91fd1eaf57d95d3f646b58d5d2d4bdd6'].includes(helper));
assert.equal(metadata(),acl);
assert.equal(query("SELECT prosecdef AND proconfig=ARRAY['search_path=pg_catalog, public'] AND has_function_privilege('service_role',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE') FROM pg_proc WHERE oid='delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure"),'t');
console.log(JSON.stringify({disposable:true,idempotent:true,unchangedOperationalTables:tables.length,compatibleTransactionRPCInstalled:true,existingAuthorizationAndACL:true}));
