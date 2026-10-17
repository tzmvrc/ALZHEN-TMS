-- NEW disposable local PostgreSQL database only, after tracking-schema.sql and
-- the two already-applied tracking migration files. Never run against Supabase.
CREATE TABLE warehouses(id uuid PRIMARY KEY,name text,latitude numeric,longitude numeric);
ALTER TABLE trips ADD COLUMN warehouse_id uuid REFERENCES warehouses(id);
INSERT INTO warehouses VALUES('00000000-0000-4000-8000-000000000080','Synthetic warehouse',9,122);
UPDATE trips SET warehouse_id='00000000-0000-4000-8000-000000000080';
INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000004','STAFF');
CREATE TABLE fixture_original_rpcs AS SELECT oid::regprocedure::text AS signature,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN('tracking_route_context_v1','tracking_route_write_v1','tracking_assignment_v1','tracking_feed_v1','tracking_write_v1','prune_tracking_v1');
