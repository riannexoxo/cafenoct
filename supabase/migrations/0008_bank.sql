-- Your toolkit and idea bank: hooks, captions, calls to action, hashtag sets, pillars, brand voice, ideas and resources.
-- client_id empty = your own library, shared across clients.
create table if not exists public.bank_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid references public.clients (id) on delete cascade,
  kind       text not null check (kind in ('hook', 'caption', 'cta', 'hashtags', 'pillar', 'voice', 'idea', 'resource')),
  title      text not null default '',
  body       text not null default '',
  url        text not null default '',
  tags       text[] not null default '{}',
  status     text not null default '',   -- idea bank: Spark, Exploring, Building, Shipped, Parked
  starred    boolean not null default false,
  used       integer not null default 0, -- how many times you copied it
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bank_items enable row level security;
drop policy if exists "Owner can do anything" on public.bank_items;
create policy "Owner can do anything" on public.bank_items for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists bank_items_user_idx on public.bank_items (user_id, client_id, kind);
drop trigger if exists touch on public.bank_items;
create trigger touch before update on public.bank_items for each row execute function public.touch_updated_at();
do $$ begin
  alter publication supabase_realtime add table public.bank_items;
exception when duplicate_object then null; end $$;
