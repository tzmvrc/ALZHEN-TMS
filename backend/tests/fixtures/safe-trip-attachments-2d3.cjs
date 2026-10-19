// Disposable PostgreSQL only. Explicit loopback, port and database checks.
const {execFileSync,execFile}=require('node:child_process');
const assert=require('node:assert/strict');
const bin='C:/Program Files/PostgreSQL/18/bin/psql.exe';
const database=process.argv[2]??'whole_trip_2d3';assert.match(database,/^whole_trip_2d3(?:_[a-z0-9_]+)?$/);
const args=['-X','-w','-h','127.0.0.1','-p','55447','-U','fixture','-d',database,'-qAt','-v','ON_ERROR_STOP=1'];
const q=sql=>execFileSync(bin,[...args,'-f','-'],{input:sql,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
assert.match(q('SHOW data_directory'),/alzhen-2d3-[a-f0-9]+/);
const id=n=>`fixture_id(${n})`,a=id(1),one=id(200),two=id(201);
q(`CREATE OR REPLACE FUNCTION fixture_pod(n bigint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM fixture_trip(n,2);PERFORM fixture_storage();
 UPDATE driver_trip_updates SET pod_image_path=(SELECT storage_path FROM trip_images WHERE trip_id=fixture_id(n)) WHERE trip_id=fixture_id(n);
END $$;`);
const passed=[];
function test(name,sql,setup='SELECT fixture_pod(200);'){
 try{q(`BEGIN;${setup} DO $test$ DECLARE r jsonb;j uuid;before_count bigint; BEGIN ${sql} END $test$;ROLLBACK;`);passed.push(name);}
 catch(error){console.error(name+' FAILED: '+error.stderr?.toString());throw error;}
}
const blocked=(sql)=>`BEGIN ${sql} RAISE EXCEPTION 'Expected blocker did not run';EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;`;
const del=`PERFORM delete_whole_trips_v1(ARRAY[${one}],${a});`;
for (const stopCount of [1,2]) test(`${stopCount} stop trip with three verified receipt attachments`,`
 r:=preview_whole_trip_deletion_v1(ARRAY[${one}],${a});
 IF jsonb_array_length(r->'blockers')<>0 OR jsonb_array_length(r->'attachment_review')<>3 THEN RAISE EXCEPTION 'Multiple receipt ownership failed';END IF;
 ${del}
 IF EXISTS(SELECT FROM trips WHERE id=${one}) OR EXISTS(SELECT FROM trip_images WHERE trip_id=${one}) OR EXISTS(SELECT FROM trip_stops WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Trip or receipt relations remain';END IF;
 IF (SELECT count(DISTINCT o->>'object_id') FROM transaction_deletion_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.storage_objects) o WHERE j.trip_id=${one} AND o->>'bucket'='trip-images')<>3 THEN RAISE EXCEPTION 'Receipt manifest lost an object';END IF;
`, `SELECT fixture_trip(200,${stopCount});
 INSERT INTO trip_images(id,trip_id,storage_path,trip_stop_id) SELECT fixture_id(n),fixture_id(200),'trips/'||fixture_id(200)||'/'||fixture_id(n)||'.jpg',fixture_id(${2000+stopCount}) FROM unnest(ARRAY[20092,20093]) n;
 UPDATE driver_trip_updates SET pod_image_path=(SELECT storage_path FROM trip_images WHERE id=fixture_id(20090)) WHERE trip_id=fixture_id(200);
 INSERT INTO driver_trip_updates(id,trip_id,driver_id,pod_image_path) SELECT fixture_id(n+4),fixture_id(200),fixture_id(3),'trips/'||fixture_id(200)||'/'||fixture_id(n)||'.jpg' FROM unnest(ARRAY[20092,20093]) n;
 SELECT fixture_storage();`);
test('single final stop with verified POD does not trip journal reference guard',`
 r:=preview_whole_trip_deletion_v1(ARRAY[${one}],${a});
 IF jsonb_array_length(r->'blockers')<>0 THEN RAISE EXCEPTION 'Unexpected preview blocker';END IF;
 ${del}
 IF EXISTS(SELECT FROM trips WHERE id=${one}) OR EXISTS(SELECT FROM trip_images WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Eligible parent or image remains';END IF;
 IF NOT EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id=${one} AND snapshot->'trip_images'->0 IS NOT NULL AND jsonb_array_length(storage_objects)>0) THEN RAISE EXCEPTION 'Image evidence lost';END IF;
`, 'SELECT fixture_trip(200,1),fixture_storage();UPDATE driver_trip_updates SET pod_image_path=(SELECT storage_path FROM trip_images WHERE trip_id=fixture_id(200)) WHERE trip_id=fixture_id(200);');

test('last-stop direct RPC preserves manifest and avoids FK SET NULL guard',`
 PERFORM delete_transaction_with_cleanup_v1(${one},fixture_id(2001),${a});
 IF EXISTS(SELECT FROM trips WHERE id=${one}) THEN RAISE EXCEPTION 'Final parent remains';END IF;
`, 'SELECT fixture_trip(200,1),fixture_storage();');

test('failure after image relation deletion restores images and journals atomically',`
 BEGIN ${del} RAISE EXCEPTION 'Injected failure absent';EXCEPTION WHEN check_violation THEN NULL;END;
 IF NOT EXISTS(SELECT FROM trips WHERE id=${one}) OR NOT EXISTS(SELECT FROM trip_images WHERE trip_id=${one}) OR EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Image rollback failed';END IF;
`, `SELECT fixture_trip(200,1),fixture_storage();CREATE FUNCTION fixture_fail_parent_2d5() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected final parent failure' USING ERRCODE='23514';END $$;CREATE TRIGGER fixture_fail_parent_2d5 BEFORE DELETE ON trips FOR EACH ROW EXECUTE FUNCTION fixture_fail_parent_2d5();`);
test('single-stop duplicate trip without POD deletes through whole-trip RPC',`
 ${del}
 IF EXISTS(SELECT FROM trips WHERE id=${one}) OR EXISTS(SELECT FROM trip_stops WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Parent or stop remains';END IF;
`, 'SELECT fixture_trip(200,1);DELETE FROM trip_images WHERE trip_id=fixture_id(200);DELETE FROM pod_records WHERE trip_id=fixture_id(200);SELECT fixture_storage();');

test('POD and loading unloading backload offload presence are eligible dependencies',`
 r:=preview_whole_trip_deletion_v1(ARRAY[${one}],${a});
 IF (r->'counts'->>'pod_records')::int<>1 OR (r->'counts'->>'loading_reports')::int<>1 OR (r->'counts'->>'unloading_reports')::int<>1 OR (r->'counts'->>'offloads')::int<>1 OR (r->'counts'->>'backloads')::int<>1 OR jsonb_array_length(r->'blockers')<>0 THEN RAISE EXCEPTION 'Eligible reports incorrectly blocked';END IF;
 ${del}
 IF EXISTS(SELECT FROM pod_records WHERE trip_id=${one}) OR EXISTS(SELECT FROM loading_reports WHERE trip_id=${one}) OR EXISTS(SELECT FROM unloading_reports WHERE trip_id=${one}) OR EXISTS(SELECT FROM offloads WHERE trip_id=${one}) OR EXISTS(SELECT FROM backloads WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Trip reports remain';END IF;
`);
test('verified legacy POD, two stops, exact manifest, master data and review audit',`
 r:=preview_whole_trip_deletion_v1(ARRAY[${one}],${a});
 IF r->'attachment_review'->0->>'status'<>'VERIFIED' THEN RAISE EXCEPTION 'Ownership not verified';END IF;
 ${del}
 IF EXISTS(SELECT FROM trips WHERE id=${one}) OR EXISTS(SELECT FROM trip_stops WHERE trip_id=${one}) OR EXISTS(SELECT FROM trip_images WHERE trip_id=${one}) OR EXISTS(SELECT FROM driver_trip_updates WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Owned relations remain';END IF;
 IF NOT EXISTS(SELECT FROM fixture_master_data) OR NOT EXISTS(SELECT FROM profiles WHERE id=fixture_id(3)) OR NOT EXISTS(SELECT FROM drivers WHERE id=fixture_id(3)) THEN RAISE EXCEPTION 'Shared data removed';END IF;
 IF NOT EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id=${one} AND snapshot->'whole_trip_deletion'->'legacy_pod_ownership'->0->>'status'='VERIFIED') OR NOT EXISTS(SELECT FROM pod_review_events WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Audit evidence missing';END IF;
 IF EXISTS(SELECT FROM transaction_deletion_jobs j CROSS JOIN jsonb_array_elements(storage_objects) o WHERE j.trip_id=${one} AND o->>'object_id' IS NULL) THEN RAISE EXCEPTION 'Object identity missing';END IF;
 IF NOT EXISTS(SELECT FROM storage.objects) THEN RAISE EXCEPTION 'SQL removed Storage';END IF;`);
for(const [name,change] of [
 ['missing receipt metadata',`DELETE FROM trip_images WHERE trip_id=${one};`],
 ['URL-only legacy evidence',`UPDATE driver_trip_updates SET pod_image_url='https://untrusted.invalid/receipt' WHERE trip_id=${one};`],
 ['mismatched uploader',`UPDATE trip_images SET uploaded_by=fixture_id(2) WHERE trip_id=${one};`],
 ['conflicting Storage owner',`UPDATE storage.objects SET owner_id=fixture_id(2)::text WHERE bucket_id='trip-images';`],
 ['missing private Storage object',`DELETE FROM storage.objects WHERE bucket_id='trip-images';`],
 ['unsupported MIME',`UPDATE storage.objects SET metadata='{"mimetype":"application/pdf"}' WHERE bucket_id='trip-images';`],
 ['missing assignment evidence',`DELETE FROM trip_truck_assignments WHERE trip_id=${one};`],
 ['inconsistent receipt stop',`UPDATE trip_images SET trip_stop_id=NULL WHERE trip_id=${one};`],
 ['retained document',`INSERT INTO documents(id,file_path,trip_id) SELECT fixture_id(999),storage_path,${one} FROM trip_images WHERE trip_id=${one};`],
 ['pending image upload',`UPDATE report_receipts SET upload_status='PENDING' WHERE trip_id=${one};`],
 ['unregistered trip namespace object',`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('trip-images','trips/'||${one}||'/'||fixture_id(999)||'.jpg','{"mimetype":"image/jpeg"}');`],
 ['financial retention',`INSERT INTO billings VALUES(fixture_id(999),${one});`],
 ['conversion retention',`INSERT INTO operations_report_conversions(source_type,source_id,target_type,target_id,trip_id) VALUES('OFFLOAD',fixture_id(20002),'BACKLOAD',fixture_id(20004),${one});`]
])test(name,`${change}${blocked(del)}IF NOT EXISTS(SELECT FROM trips WHERE id=${one}) OR EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id=${one}) THEN RAISE EXCEPTION 'Blocker partially deleted';END IF;`);
test('cross-trip shared Storage history blocks',`INSERT INTO driver_trip_updates VALUES(fixture_id(990),${two},fixture_id(3),NULL,(SELECT storage_path FROM trip_images WHERE trip_id=${one}));${blocked(del)}`,'SELECT fixture_pod(200);SELECT fixture_trip(201,1);');
test('multi-trip financial failure rolls all relations and journals back',`INSERT INTO payables VALUES(fixture_id(999),${two});${blocked(`PERFORM delete_whole_trips_v1(ARRAY[${one},${two}],${a});`)}IF (SELECT count(*) FROM trips WHERE id IN(${one},${two}))<>2 OR EXISTS(SELECT FROM transaction_deletion_jobs WHERE trip_id IN(${one},${two})) THEN RAISE EXCEPTION 'Batch partially committed';END IF;`,'SELECT fixture_pod(200);SELECT fixture_pod(201);');
test('deduplicate repeated parents and retry idempotently',`r:=delete_whole_trips_v1(ARRAY[${one},${one}],${a});IF jsonb_array_length(r)<>2 OR jsonb_array_length(delete_whole_trips_v1(ARRAY[${one}],${a}))<>2 THEN RAISE EXCEPTION 'Duplicate deletion differs';END IF;`);
test('two independent trips and unrelated trip preserved',`PERFORM delete_whole_trips_v1(ARRAY[${one},${two}],${a});IF EXISTS(SELECT FROM trips WHERE id IN(${one},${two})) OR NOT EXISTS(SELECT FROM trips WHERE id=fixture_id(202)) THEN RAISE EXCEPTION 'Batch scope incorrect';END IF;`,'SELECT fixture_pod(200);SELECT fixture_pod(201);SELECT fixture_pod(202);');
for(const role of [2,3])test(`role ${role} cannot delete`, `BEGIN PERFORM delete_whole_trips_v1(ARRAY[${one}],fixture_id(${role}));RAISE EXCEPTION 'Unauthorized delete';EXCEPTION WHEN insufficient_privilege THEN NULL;END;`);
test('partial stop retains driver POD evidence',blocked(`PERFORM delete_transaction_with_cleanup_v1(${one},fixture_id(2001),${a});`));
test('cleanup validator returns only journal object identities',`${del} SELECT id INTO j FROM transaction_deletion_jobs WHERE trip_id=${one} AND jsonb_array_length(storage_objects)>0; r:=validate_transaction_cleanup_objects_v1(j,${a});IF jsonb_array_length(r)=0 OR r->0->>'object_id' IS NULL THEN RAISE EXCEPTION 'Invalid cleanup manifest';END IF;`);
test('replacement Storage object blocks cleanup',`${del} SELECT id INTO j FROM transaction_deletion_jobs WHERE trip_id=${one} AND EXISTS(SELECT FROM jsonb_array_elements(storage_objects) o WHERE o->>'bucket'='trip-images') LIMIT 1; UPDATE storage.objects SET id=gen_random_uuid() WHERE bucket_id='trip-images'; ${blocked(`PERFORM validate_transaction_cleanup_objects_v1(j,${a});`)}`);
test('same-ID Storage content metadata change blocks cleanup',`${del} SELECT id INTO j FROM transaction_deletion_jobs WHERE trip_id=${one} AND EXISTS(SELECT FROM jsonb_array_elements(storage_objects) o WHERE o->>'bucket'='trip-images') LIMIT 1;UPDATE storage.objects SET metadata=metadata||'{"eTag":"replacement"}'::jsonb WHERE bucket_id='trip-images';${blocked(`PERFORM validate_transaction_cleanup_objects_v1(j,${a});`)}`);
test('already removed Storage objects allow idempotent cleanup',`${del} SELECT id INTO j FROM transaction_deletion_jobs WHERE trip_id=${one} AND jsonb_array_length(storage_objects)>0 ORDER BY created_at DESC LIMIT 1;DELETE FROM storage.objects;IF jsonb_array_length(validate_transaction_cleanup_objects_v1(j,${a}))<>0 THEN RAISE EXCEPTION 'Missing object not idempotent';END IF;`);
test('journal tombstone rejects new references',`${del}${blocked(`INSERT INTO documents(id,file_path) SELECT fixture_id(999),o->>'path' FROM transaction_deletion_jobs CROSS JOIN jsonb_array_elements(storage_objects) o WHERE trip_id=${one} LIMIT 1;`)}`);
test('private execution grants and read-only preview',`IF has_function_privilege('authenticated','delete_whole_trips_v1(uuid[],uuid)','EXECUTE') OR has_function_privilege('anon','validate_transaction_cleanup_objects_v1(uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','inspect_legacy_pod_ownership_v1(uuid[])','EXECUTE') THEN RAISE EXCEPTION 'Private RPC exposed';END IF;SELECT count(*) INTO before_count FROM transaction_deletion_jobs;PERFORM preview_whole_trip_deletion_v1(ARRAY[${one}],${a});IF (SELECT count(*) FROM transaction_deletion_jobs)<>before_count THEN RAISE EXCEPTION 'Preview mutated';END IF;`);
test('twenty one parent batch rejected',`BEGIN PERFORM delete_whole_trips_v1((SELECT array_agg(fixture_id(n)) FROM generate_series(300,320) n),${a});RAISE EXCEPTION '21 parents accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;`,'');
test('twenty parent batch succeeds',`PERFORM delete_whole_trips_v1((SELECT array_agg(fixture_id(n)) FROM generate_series(300,319) n),${a});IF EXISTS(SELECT FROM trips WHERE id IN(SELECT fixture_id(n) FROM generate_series(300,319) n)) THEN RAISE EXCEPTION 'Batch incomplete';END IF;`,'SELECT fixture_trip(n,0) FROM generate_series(300,319) n;');

const asyncQ=sql=>new Promise((resolve,reject)=>execFile(bin,[...args,'-c',sql],{windowsHide:true},(error,out,err)=>error?reject(Error(err)):resolve(out.trim())));
(async()=>{
 q('SELECT fixture_pod(900)');
 const remove='SELECT delete_whole_trips_v1(ARRAY[fixture_id(900)],fixture_id(1))->0->>\'id\'';
 const results=await Promise.all([asyncQ(`BEGIN;${remove};SELECT pg_sleep(0.2);COMMIT;`),asyncQ(remove)]);
 assert.equal(results[0].split(/\s+/)[0],results[1]);assert.equal(q('SELECT count(*) FROM transaction_deletion_jobs WHERE trip_id=fixture_id(900)'),'2');passed.push('concurrent duplicate deletes share journals');
 q('SELECT fixture_pod(901)');
 const writer=asyncQ("SET application_name='fixture-2d3-writer';BEGIN;UPDATE driver_trip_updates SET pod_image_path='trips/'||fixture_id(901)||'/'||fixture_id(999)||'.jpg' WHERE trip_id=fixture_id(901);SELECT pg_sleep(0.8);COMMIT;");
 for(let n=0;n<100;n++){if(q("SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name='fixture-2d3-writer' AND l.relation='driver_trip_updates'::regclass AND l.granted")!=='0')break;await new Promise(resolve=>setTimeout(resolve,10));if(n===99)throw Error('Writer lock not observed');}
 await assert.rejects(asyncQ('SELECT delete_whole_trips_v1(ARRAY[fixture_id(901)],fixture_id(1))'),/ownership\/retention is unresolved/);await writer;
 assert.equal(q('SELECT count(*) FROM trips WHERE id=fixture_id(901)'),'1');assert.equal(q('SELECT count(*) FROM transaction_deletion_jobs WHERE trip_id=fixture_id(901)'),'0');passed.push('concurrent driver mutation rechecked under lock');
 console.log(JSON.stringify({disposable:true,port:55447,passed:passed.length,failed:0,cases:passed}));
})().catch(error=>{console.error(error);process.exitCode=1;});

