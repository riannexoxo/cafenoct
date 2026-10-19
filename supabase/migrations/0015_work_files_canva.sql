-- Work files on design and video requests (kept exactly as uploaded) and a Canva connection.

alter table public.deliverables add column if not exists files jsonb not null default '[]'::jsonb;  -- [{path,name,type,size,w,h,at,from}]
alter table public.deliverables add column if not exists canva jsonb not null default '{}'::jsonb;  -- {id,title,thumb}

-- Private bucket: files are only reachable through short-lived signed links. Up to 50 MB each.
-- No update policy, so a file can never be overwritten or changed once it's uploaded; replace means upload a new one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-files', 'work-files', false, 52428800, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/tiff',
  'application/pdf', 'video/mp4', 'video/quicktime', 'video/webm'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners add work files" on storage.objects;
create policy "Owners add work files" on storage.objects for insert to authenticated
  with check (bucket_id = 'work-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners read work files" on storage.objects;
create policy "Owners read work files" on storage.objects for select to authenticated
  using (bucket_id = 'work-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners remove work files" on storage.objects;
create policy "Owners remove work files" on storage.objects for delete to authenticated
  using (bucket_id = 'work-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Who connected Canva (the page shows this) and their sign-in tokens (server only, no policies).
create table if not exists public.canva_connections (
  user_id      uuid primary key default auth.uid() references auth.users on delete cascade,
  canva_user   text not null default '',
  name         text not null default '',
  connected_at timestamptz not null default now()
);
alter table public.canva_connections enable row level security;
create policy "canva_connections own select" on public.canva_connections for select using (user_id = auth.uid());
create policy "canva_connections own delete" on public.canva_connections for delete using (user_id = auth.uid());

create table if not exists public.canva_tokens (
  user_id       uuid primary key references auth.users on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);
alter table public.canva_tokens enable row level security;
