// Run only against a newly created owned fixture database, never a shared server.
const {spawn,spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const db=process.argv[2],psql='C:/Program Files/PostgreSQL/18/bin/psql.exe';
if(!/^collaboration_versions_[a-f0-9]{32}$/.test(db??''))throw Error('A named disposable fixture database is required');
const args=['-w','-h','127.0.0.1','-p','55439','-U','fixture','-d',db,'-At','-v','ON_ERROR_STOP=1'];
const run=sql=>{const result=spawnSync(psql,[...args,'-c',sql],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);return result.stdout.trim();};
const root=run('SHOW data_directory').replaceAll('\\','/');
assert.equal(root,'C:/Users/WarL0cK/AppData/Local/Temp/alzhen-offload-pg-3a8b91380da44e0a88dad073aab2cdde/data');
run("INSERT INTO trip_stops(id,value) VALUES ('00000000-0000-4000-8000-000000000099','original')");
const first=spawn(psql,[...args,'-c',"BEGIN; UPDATE trip_stops SET value='first' WHERE id='00000000-0000-4000-8000-000000000099'; SELECT 'LOCK_HELD'; SELECT pg_sleep(1); COMMIT;"],{windowsHide:true});
let output='';const done=new Promise((resolve,reject)=>{first.on('exit',code=>code===0?resolve():reject(Error('First connection failed')));first.on('error',reject);});
const held=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Lock not acquired')),5000);first.stdout.on('data',part=>{output+=part;if(output.includes('LOCK_HELD')){clearTimeout(timeout);resolve();}});});
(async()=>{await held;const second=run("UPDATE trip_stops SET value='second' WHERE id='00000000-0000-4000-8000-000000000099' RETURNING collaboration_version");await done;assert.match(second,/^2\b/);assert.equal(run("SELECT value||':'||collaboration_version FROM trip_stops WHERE id='00000000-0000-4000-8000-000000000099'"),'second:2');console.log(JSON.stringify({disposablePostgres:true,concurrentConnections:2,lastCommittedValue:'second',version:2}));})().catch(error=>{console.error(error);process.exitCode=1;});
