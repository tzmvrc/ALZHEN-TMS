// Disposable only. Installation drift fails closed and rolls back the transaction.
const {execFileSync}=require('node:child_process'),{readFileSync}=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const database=process.argv[2],directory=process.argv[3];
assert.match(database??'',/^whole_trip_[a-z0-9_]+$/);assert.match(path.basename(directory??''),/^alzhen-planned-routes-[a-f0-9]+$/);
function run(sql){return execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-qAt','-h','127.0.0.1','-p','55443','-U','fixture','-d',database,'-v','ON_ERROR_STOP=1','-f','-'],{input:sql,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}
assert.equal(path.normalize(run('SHOW data_directory')).toLowerCase(),path.normalize(directory).toLowerCase());
const proposal=readFileSync('backend/migrations/2026_11_08_proposed_driver_update_parent.sql','utf8').replace('BEGIN;','');
const checks=[
 ["CREATE OR REPLACE FUNCTION public.delete_transaction_with_cleanup_v1(p_trip_id uuid,p_stop_id uuid,p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN RETURN '{}'::jsonb; END $$;",'Unexpected transaction deletion RPC definition'],
 ['ALTER TABLE driver_trip_updates DROP CONSTRAINT whole_trip_driver_update_parent_fk; ALTER TABLE driver_trip_updates ADD CONSTRAINT whole_trip_driver_update_parent_fk FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE NOT VALID;','Unexpected driver update FK definition'],
 ['GRANT EXECUTE ON FUNCTION delete_transaction_with_cleanup_v1(uuid,uuid,uuid) TO authenticated;','Unexpected transaction deletion RPC privileges']
];
for(const [tamper,message] of checks){let failed=false;try{run('BEGIN;'+tamper+proposal);}catch(e){assert.ok(e.stderr.toString().includes(message),e.stderr.toString());failed=true;}assert.ok(failed,'Unexpected drift accepted');}
assert.equal(run("SELECT md5(replace(pg_get_functiondef('delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),chr(13),''))"),'91fd1eaf57d95d3f646b58d5d2d4bdd6');
assert.equal(run("SELECT confdeltype FROM pg_constraint WHERE conname='whole_trip_driver_update_parent_fk'"),'r');
assert.equal(run("SELECT has_function_privilege('authenticated','delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')"),'f');
console.log(JSON.stringify({disposable:true,installationDriftCases:checks.length,failed:0,rollbackPreservedDefinitionFKAndACL:true}));
