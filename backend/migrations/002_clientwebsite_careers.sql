begin;
alter table public.website_content drop constraint if exists website_content_collection_check;
alter table public.website_content add constraint website_content_collection_check
  check (collection in ('trucks', 'announcements', 'careers'));
commit;
