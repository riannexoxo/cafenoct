-- Tools for three more roles: graphic design and video editing (a request queue), data entry (batches),
-- plus a brand kit per client.

-- One design or video request, from brief to delivered.
create table if not exists public.deliverables (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  client_id     uuid references public.clients on delete cascade,
  kind          text not null check (kind in ('design', 'video')),
  title         text not null,
  type          text not null default '',      -- Social post, Logo, Reel, YouTube video…
  size          text not null default '',      -- 1080×1350, 9:16…
  length        text not null default '',      -- video length target, e.g. 30–45s
  status        text not null default 'brief',
  brief         text not null default '',
  links         jsonb not null default '{}'::jsonb, -- {"ref": "...", "work": "...", "final": "..."}
  revisions     int not null default 0,
  max_revisions int not null default 2,
  due_date      date,
  delivered_at  timestamptz,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists deliverables_user_kind on public.deliverables (user_id, kind, status);

-- A data entry batch: how many records, how many done, how many errors found in QA.
create table if not exists public.batches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  client_id    uuid references public.clients on delete cascade,
  title        text not null,
  source       text not null default '',  -- where the records come from
  target       text not null default '',  -- where they go (sheet, CRM…)
  link         text not null default '',
  total        int not null default 0,
  done         int not null default 0,
  errors       int not null default 0,     -- mistakes found when checking
  checked      int not null default 0,     -- records checked in QA
  minutes      int not null default 0,
  status       text not null default 'todo' check (status in ('todo', 'doing', 'qa', 'delivered')),
  due_date     date,
  notes        text not null default '',
  delivered_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists batches_user_status on public.batches (user_id, status);

-- Each client's brand kit: colors, fonts, logo and asset links, notes.
create table if not exists public.brand_kits (
  client_id  uuid primary key references public.clients on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  colors     jsonb not null default '[]'::jsonb, -- [{"name": "Rose", "hex": "#D9A5A8"}]
  fonts      jsonb not null default '[]'::jsonb, -- [{"name": "Poppins", "use": "Headings"}]
  links      jsonb not null default '[]'::jsonb, -- [{"label": "Logo files", "url": "https://..."}]
  notes      text not null default '',
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['deliverables', 'batches', 'brand_kits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s own select" on public.%I for select using (user_id = auth.uid())', t, t);
    execute format('create policy "%s own insert" on public.%I for insert with check (user_id = auth.uid())', t, t);
    execute format('create policy "%s own update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy "%s own delete" on public.%I for delete using (user_id = auth.uid())', t, t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
