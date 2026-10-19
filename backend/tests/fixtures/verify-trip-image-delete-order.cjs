// LOCAL DISPOSABLE DATABASE ONLY. Reproduce the installed bug, then test proposal.
const {execFileSync}=require('node:child_process'),{readFileSync}=require('node:fs'),assert=require('node:assert/strict');
const database=process.argv[2];assert.match(database??'',/^whole_trip_2d3_[a-z0-9_]+$/);
const args=['-X','-w','-h','127.0.0.1','-p','55447','-U','fixture','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-f','-'];
const q=sql=>execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',args,{input:sql,encoding:'utf8',windowsHide:true});
assert.match(q('SHOW data_directory'),/alzhen-2d3-[a-f0-9]+/);
const reproduced=q(`BEGIN;SELECT fixture_trip(771,1),fixture_storage();
DO $$ BEGIN
 BEGIN PERFORM delete_whole_trips_v1(ARRAY[fixture_id(771)],fixture_id(1));RAISE EXCEPTION 'Expected installed bug absent';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN
  IF SQLERRM <> 'Attachment belongs to a committed deletion journal and cannot be reused.' THEN RAISE; END IF;
 END;
 IF NOT EXISTS(SELECT FROM trips WHERE id=fixture_id(771)) OR EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id=fixture_id(771)) THEN RAISE EXCEPTION 'Reproduction rollback failed';END IF;
END $$;ROLLBACK;SELECT 'installed_bug_reproduced';`);
assert.match(reproduced,/installed_bug_reproduced/);
const tables=['trips','trip_stops','trip_line_items','trip_truck_assignments','driver_trip_updates','trip_images','pod_records','report_receipts','storage.objects','transaction_deletion_jobs','pod_review_events','fixture_master_data'];
const snapshot=()=>tables.map(t=>q(`SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'')) FROM ${t} r`).trim());
const before=snapshot();q(readFileSync('backend/migrations/2026_11_14_proposed_trip_image_delete_order.sql','utf8'));assert.deepEqual(snapshot(),before);
console.log(JSON.stringify({disposable:true,installedBugReproduced:true,proposalPreservedTables:tables.length}));
process.stdout.write(execFileSync(process.execPath,['backend/tests/fixtures/safe-trip-attachments-2d3.cjs',database],{encoding:'utf8',windowsHide:true}));
