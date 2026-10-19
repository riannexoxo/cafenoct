-- Real social analytics: connected Facebook Pages, Instagram and TikTok accounts.

create table if not exists public.social_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  client_id      uuid references public.clients on delete set null,
  platform       text not null check (platform in ('Facebook', 'Instagram', 'TikTok')),
  external_id    text not null,
  name           text not null default '',
  avatar         text not null default '',
  import         boolean not null default true, -- add posts you didn't log to the content calendar
  last_synced_at timestamptz,
  last_error     text not null default '',
  created_at     timestamptz not null default now(),
  unique (user_id, platform, external_id)
);
alter table public.social_accounts enable row level security;
create policy "social_accounts own select" on public.social_accounts for select using (user_id = auth.uid());
create policy "social_accounts own update" on public.social_accounts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "social_accounts own delete" on public.social_accounts for delete using (user_id = auth.uid());
alter publication supabase_realtime add table public.social_accounts;

-- Sign-in tokens for those accounts. No policies: only the server (secret key) can read or write them.
create table if not exists public.social_tokens (
  account_id         uuid primary key references public.social_accounts on delete cascade,
  user_id            uuid not null references auth.users on delete cascade,
  access_token       text not null,
  refresh_token      text not null default '',
  expires_at         timestamptz,
  refresh_expires_at timestamptz,
  updated_at         timestamptz not null default now()
);
alter table public.social_tokens enable row level security;

-- Each post's id on each platform, so synced numbers land on the right post: {"Instagram": "1789..."}.
alter table public.posts add column if not exists post_refs jsonb not null default '{}'::jsonb;
