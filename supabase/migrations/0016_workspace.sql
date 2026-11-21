-- Rebuild: one dataset, many views; comments; the inbox; favorites; project updates; richer client records.
-- Additive only. Every new table has RLS on and owner-only policies for signed-in users, created right here.

-- Tasks: labels (Trello-style) and milestones (Asana-style).
alter table public.tasks add column if not exists labels text[] not null default '{}';
alter table public.tasks add column if not exists milestone boolean not null default false;

-- Clients become a real contact record: tags and custom fields.
alter table public.clients add column if not exists tags text[] not null default '{}';
alter table public.clients add column if not exists fields jsonb not null default '{}'::jsonb;

-- Your own saved views over tasks, projects or posts (filters, grouping, which view).
create table if not exists public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  scope      text not null default 'tasks' check (scope in ('tasks', 'projects', 'posts')),
  name       text not null check (char_length(name) between 1 and 80),
  config     jsonb not null default '{}'::jsonb,
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Comment threads on deliverables, posts, projects and invoices (tasks keep task_comments).
-- A client's comment arrives through the portal or an approval link; "shared" comments are the ones the client sees.
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade, -- the workspace owner
  entity      text not null check (entity in ('deliverable', 'post', 'project', 'invoice')),
  entity_id   uuid not null,
  client_id   uuid references public.clients on delete cascade,
  author      text not null default 'me' check (author in ('me', 'client')),
  author_name text not null default '' check (char_length(author_name) <= 80),
  body        text not null check (char_length(body) between 1 and 4000),
  shared      boolean not null default false,
  parent_id   uuid references public.comments on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists comments_entity_idx on public.comments (user_id, entity, entity_id);

-- The inbox: everything that needs you, in one stream.
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  kind       text not null check (kind in ('approval', 'changes', 'comment', 'post_failed', 'invoice', 'automation', 'booking', 'intake', 'system')),
  title      text not null check (char_length(title) between 1 and 300),
  body       text not null default '',
  href       text not null default '',
  entity     text,
  entity_id  uuid,
  client_id  uuid references public.clients on delete set null,
  read_at    timestamptz,
  saved      boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_feed_idx on public.notifications (user_id, created_at desc);

-- Favorites: pinned pages and records, reachable from the sidebar and Cmd+K.
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  kind       text not null default 'page' check (kind in ('client', 'project', 'task', 'doc', 'invoice', 'post', 'page')),
  label      text not null check (char_length(label) between 1 and 120),
  href       text not null check (href like '/%' and char_length(href) <= 300),
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, href)
);

-- Project status updates (on track / at risk / off track), shown to the client in their portal.
create table if not exists public.project_updates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  state      text not null default 'on_track' check (state in ('on_track', 'at_risk', 'off_track')),
  body       text not null default '' check (char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_updates_project_idx on public.project_updates (project_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['saved_views', 'comments', 'notifications', 'favorites', 'project_updates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s own select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s own insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s own update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s own delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_idx', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
