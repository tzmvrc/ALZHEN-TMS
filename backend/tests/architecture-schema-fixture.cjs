// Restores metadata only into this task's isolated PostgreSQL cluster. No production data.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/architecture-schema-catalog.json'),'utf8'));
const fixture=fs.readFileSync(path.join(process.env.TEMP,'alzhen-current-architecture-fixture.txt'),'utf8').trim(),database=process.argv[2]??'architecture_fixture';
if(!/^architecture_[a-z0-9_]+$/.test(database)||!/^alzhen-architecture-fixture-\d+$/.test(path.basename(fixture)))throw Error('Unsafe fixture identity');
function sql(text,db=database){return execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-h','127.0.0.1','-p','55439','-U','fixture_admin','-d',db,'-qAt','-v','ON_ERROR_STOP=1','-f','-'],{input:text,encoding:'utf8',windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'},stdio:['pipe','pipe','pipe']}).trim();}
if(path.normalize(sql('SHOW data_directory','postgres')).toLowerCase()!==path.normalize(fixture).toLowerCase())throw Error('Wrong fixture server');
const quote=x=>'"'+x.replaceAll('"','""')+'"',literal=x=>"'"+x.replaceAll("'","''")+"'";
if(sql(`SELECT count(*) FROM pg_database WHERE datname=${literal(database)}`,'postgres')!=='0')throw Error('Fixture database already exists; choose a fresh name');
sql(`CREATE DATABASE ${quote(database)}`,'postgres');
const pre=`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;END $$;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE SCHEMA extensions;CREATE EXTENSION IF NOT EXISTS pgcrypto;CREATE EXTENSION IF NOT EXISTS "uuid-ossp";CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean DEFAULT false);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;SET check_function_bodies=off;`;
sql(pre);
for(const e of catalog.enums??[])sql(`CREATE TYPE public.${quote(e.typname)} AS ENUM(${e.labels.map(literal).join(',')})`);
for(const sequence of catalog.sequences??[])sql(`CREATE SEQUENCE public.${quote(sequence)}`);
sql(catalog.tables.map(t=>`SET check_function_bodies=off;CREATE TABLE ${quote(t.schema)}.${quote(t.name)}(${t.columns});`).join("\n"));
sql(catalog.constraints.filter(c=>!c.definition.startsWith('FOREIGN KEY')).map(c=>`ALTER TABLE ${quote(c.schema)}.${quote(c.name)} ADD CONSTRAINT ${quote(c.conname)} ${c.definition};`).join("\n"));
sql(JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/architecture-indexes.json'),'utf8')).map(index=>index.indexdef+';').join('\n'));
sql(catalog.constraints.filter(c=>c.definition.startsWith('FOREIGN KEY')).map(c=>`ALTER TABLE ${quote(c.schema)}.${quote(c.name)} ADD CONSTRAINT ${quote(c.conname)} ${c.definition};`).join("\n"));
sql("SET check_function_bodies=off;\n"+catalog.functions.map(f=>f+";").join("\n"));
sql(catalog.triggers.map(t=>t+";").join("\n"));
sql(fs.readFileSync(path.join(__dirname,"fixtures/architecture-identities.sql"),"utf8"));
let views=[...catalog.views];while(views.length){const retry=[];let progress=0;for(const v of views){try{sql(`CREATE VIEW public.${quote(v.viewname)} AS ${v.definition}`);progress++;}catch(error){retry.push(v);}}if(!progress)throw Error('Unresolved fixture views: '+retry.map(x=>x.viewname));views=retry;}
console.log(JSON.stringify({database,tables:catalog.tables.length,functions:catalog.functions.length,productionRecordsCopied:0}));
