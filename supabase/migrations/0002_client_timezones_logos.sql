-- Each client can have their own time zone (their usual hours are in their time) and a logo.
alter table public.clients add column if not exists timezone text not null default '';  -- IANA name, e.g. America/New_York. Empty = same as you.
alter table public.clients add column if not exists logo_url text not null default '';

-- Client logos live in a public "logos" bucket, each person's files in a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners add logos" on storage.objects;
create policy "Owners add logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners change logos" on storage.objects;
create policy "Owners change logos" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners remove logos" on storage.objects;
create policy "Owners remove logos" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
