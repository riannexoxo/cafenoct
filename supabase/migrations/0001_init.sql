-- CafeNoct database
-- Every table has a user_id, and Row Level Security means a signed-in person can only ever see and change
-- their own rows. That's what lets other people use CafeNoct later without seeing each other's data.

-- ---------- helpers ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Adds the owner column, timestamps, the "only your own rows" policy and live updates to a table.
create or replace function public.cafenoct_own(tbl regclass) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('drop policy if exists "Owner can do anything" on %s', tbl);
  execute format('create policy "Owner can do anything" on %s for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl);
  execute format('drop trigger if exists touch on %s', tbl);
  execute format('create trigger touch before update on %s for each row execute function public.touch_updated_at()', tbl);
  execute format('create index if not exists %s on %s (user_id)', replace(tbl::text, 'public.', '') || '_user_idx', tbl);
  begin
    execute format('alter publication supabase_realtime add table %s', tbl);
  exception when duplicate_object then null;
  end;
end $$;

-- ---------- profile and settings (one row per person) ----------
create table if not exists public.profiles (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name         text not null default '',
  business     text not null default '',
  invoice_email text not null default '',
  currency     text not null default 'USD',
  weekly_goal  numeric not null default 40,
  settings     jsonb not null default '{}'::jsonb, -- focus lengths, automations, statuses, theme
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
select public.cafenoct_own('public.profiles');

-- ---------- clients ----------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  company       text not null default '',
  email         text not null default '',
  contact       text not null default '',
  services      text not null default '',
  status        text not null default 'Active' check (status in ('Active', 'Lead', 'Paused', 'Past')),
  source        text not null default '',
  rate          numeric,
  rate_type     text not null default 'Hourly' check (rate_type in ('Hourly', 'Monthly', 'Per project', 'No fixed rate', 'Unpaid')),
  currency      text not null default 'USD',
  work_days     smallint[] not null default '{}', -- 1 = Monday ... 7 = Sunday
  hours_per_day numeric,
  weekly_hours  numeric,
  start_time    time,
  report_cadence text not null default '' check (report_cadence in ('', 'Daily', 'Weekly')),
  color         text not null default '#976A4B',
  links         text not null default '',
  notes         text not null default '',
  start_date    date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
select public.cafenoct_own('public.clients');

-- ---------- projects ----------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete cascade,
  name        text not null,
  status      text not null default 'Active' check (status in ('Active', 'On hold', 'Done')),
  start_date  date,
  due_date    date,
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.cafenoct_own('public.projects');

-- ---------- tasks (to-do lists, deliverables, boards) ----------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete set null,
  project_id  uuid references public.projects (id) on delete set null,
  title       text not null,
  notes       text not null default '',
  status      text not null default 'todo',
  priority    text not null default 'med' check (priority in ('low', 'med', 'high')),
  start_date  date,
  due_date    date,
  repeat      text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  done_at     timestamptz,
  subtasks    jsonb not null default '[]'::jsonb,  -- [{id, title, done}]
  links       jsonb not null default '[]'::jsonb,  -- [{id, url, label}]
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.cafenoct_own('public.tasks');
create index if not exists tasks_client_due_idx on public.tasks (user_id, client_id, due_date);

create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.cafenoct_own('public.task_comments');

-- ---------- time ----------
create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete set null,
  task_id     uuid references public.tasks (id) on delete set null,
  started_at  timestamptz not null,
  minutes     integer not null check (minutes > 0),
  note        text not null default '',
  source      text not null default 'manual' check (source in ('manual', 'timer', 'focus')),
  invoice_id  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.cafenoct_own('public.time_entries');
create index if not exists time_entries_client_start_idx on public.time_entries (user_id, client_id, started_at);

-- Running timers. A timer is just a start time, so it keeps counting through closed apps and restarts.
create table if not exists public.timers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid references public.clients (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete set null,
  note       text not null default '',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.cafenoct_own('public.timers');

-- Blocked time on the calendar
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid references public.clients (id) on delete cascade,
  title      text not null default '',
  starts_at  timestamptz not null,
  ends_at    timestamptz not null check (ends_at > starts_at),
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.cafenoct_own('public.events');

-- ---------- content ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete cascade,
  platform    text not null default 'Instagram',
  publish_on  date,
  publish_at  time,
  status      text not null default 'Idea' check (status in ('Idea', 'Drafting', 'Scheduled', 'Posted')),
  format      text not null default '',
  title       text not null default '',
  caption     text not null default '',
  hashtags    text not null default '',
  asset_url   text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.cafenoct_own('public.posts');

-- ---------- money ----------
create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete set null,
  number      text not null,
  issue_date  date not null default current_date,
  due_date    date,
  currency    text not null default 'USD',
  status      text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  items       jsonb not null default '[]'::jsonb, -- [{desc, qty, rate}]
  paid_date   date,
  paid_amount numeric,
  method      text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.cafenoct_own('public.invoices');

-- ---------- docs and reports ----------
create table if not exists public.docs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid references public.clients (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title      text not null default 'Untitled',
  body       text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.cafenoct_own('public.docs');

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  kind         text not null check (kind in ('day', 'week')),
  period_start date not null,
  body         text not null,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, client_id, kind, period_start)
);
select public.cafenoct_own('public.reports');

-- ---------- job hunt ----------
create table if not exists public.applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role         text not null,
  company      text not null default '',
  platform     text not null default '',
  applied_on   date not null default current_date,
  status       text not null default 'Applied',
  rate         text not null default '',
  last_contact date,
  link         text not null default '',
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
select public.cafenoct_own('public.applications');

-- New sign-ups get an empty profile automatically.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, invoice_email) values (new.id, coalesce(new.email, '')) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- The setup helper is only needed while creating tables; remove it so it can't be called from outside.
drop function if exists public.cafenoct_own(regclass);
