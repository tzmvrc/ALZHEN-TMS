-- Disposable local PostgreSQL ONLY. Never run this fixture on Supabase.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);
INSERT INTO storage.buckets VALUES('trip-images',false,5242880,ARRAY['image/jpeg','image/png','image/webp']);
CREATE TABLE public.trip_images(id uuid PRIMARY KEY,trip_id uuid,trip_stop_id uuid,kind text);
INSERT INTO public.trip_images VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','receipt');
