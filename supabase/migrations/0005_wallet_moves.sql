-- Money moving between your wallets: converting USD to PHP, or withdrawing to a bank or GCash.
create table if not exists public.wallet_moves (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null default 'convert' check (kind in ('convert', 'withdraw')),
  moved_on      date not null default current_date,
  from_currency text not null,
  from_amount   numeric not null check (from_amount > 0),
  to_currency   text,
  to_amount     numeric,
  method        text not null default '',
  note          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Same "only your own rows" rules as every other table.
alter table public.wallet_moves enable row level security;
drop policy if exists "Owner can do anything" on public.wallet_moves;
create policy "Owner can do anything" on public.wallet_moves for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists wallet_moves_user_idx on public.wallet_moves (user_id);
drop trigger if exists touch on public.wallet_moves;
create trigger touch before update on public.wallet_moves for each row execute function public.touch_updated_at();
do $$ begin
  alter publication supabase_realtime add table public.wallet_moves;
exception when duplicate_object then null; end $$;
