-- Thumbnails and carousel slides for content calendar posts. The first one is the cover.
alter table public.posts add column if not exists media text[] not null default '{}';

-- Post images and videos live in a "post-media" bucket, each person's files in a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', true, 26214400, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Owners add post media" on storage.objects;
create policy "Owners add post media" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners remove post media" on storage.objects;
create policy "Owners remove post media" on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
