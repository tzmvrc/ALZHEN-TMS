-- Disposable fixture only. Model the captured owner-security view privilege path.
CREATE TABLE public.pod_drive_files(id integer PRIMARY KEY, file_name text);
INSERT INTO public.pod_drive_files VALUES(1,'isolated-fixture');
ALTER TABLE public.pod_drive_files ENABLE ROW LEVEL SECURITY;
CREATE VIEW public.vw_pod_drive_files AS SELECT id,file_name FROM public.pod_drive_files;
