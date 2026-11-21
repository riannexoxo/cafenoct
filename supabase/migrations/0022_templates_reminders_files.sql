-- Rebuild round 2: templates for anything, reminders, files on task cards. Additive only.

-- Templates: save a task, checklist, post or invoice once and start new ones from it.
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  kind       text not null check (kind in ('task', 'checklist', 'post', 'invoice')),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reminders: "remind me" on any item. When it's due it becomes an Inbox notification.
create table if not exists public.reminders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 300),
  href       text not null default '' check (href = '' or href ~ '^/[^/\\]'),
  entity     text check (entity is null or entity in ('task', 'post', 'invoice', 'deliverable', 'project', 'client', 'event')),
  entity_id  uuid,
  client_id  uuid references public.clients on delete set null,
  remind_at  timestamptz not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (user_id, remind_at) where sent_at is null;

do $$
declare t text;
begin
  foreach t in array array['templates', 'reminders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s own select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s own insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s own update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s own delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_idx', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- A reminder's client must be in the same workspace (same check as the other new tables).
create trigger cn_client_owned before insert or update of client_id, user_id on public.reminders
  for each row execute function public.cn_client_owned();

-- Turns the signed-in person's due reminders into Inbox notifications. Runs as that person (RLS applies).
create or replace function public.deliver_reminders() returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  with due as (
    update public.reminders set sent_at = now()
    where user_id = (select auth.uid()) and sent_at is null and remind_at <= now()
    returning user_id, title, href, entity, entity_id, client_id
  )
  insert into public.notifications (user_id, kind, title, href, entity, entity_id, client_id)
  select user_id, 'system', left('Reminder: ' || title, 300), href, entity, entity_id, client_id from due;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.deliver_reminders() from public, anon;
grant execute on function public.deliver_reminders() to authenticated;

-- Files on task cards (Trello-style attachments). Paths point into the private attachments bucket.
alter table public.tasks add column if not exists files jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- Each person's files live under a folder named with their user id.
create policy "attachments own read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "attachments own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "attachments own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
