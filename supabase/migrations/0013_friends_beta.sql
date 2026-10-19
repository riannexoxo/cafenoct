-- Friends beta: invite-only sign-up and in-app feedback.

-- The app owner (Rianne). Only the server reads this.
create table if not exists public.app_owners (user_id uuid primary key references auth.users on delete cascade);
alter table public.app_owners enable row level security;

-- Invite codes. One code = one new account. Only the server reads or writes them.
create table if not exists public.invites (
  code       text primary key,
  note       text not null default '', -- who it's for
  created_at timestamptz not null default now(),
  used_by    uuid, -- the new account (no foreign key: it's set while that account is still being created)
  used_at    timestamptz
);
alter table public.invites enable row level security;

-- Every new account must bring an unused invite code (in its sign-up details). Accounts that already exist are untouched.
create or replace function public.require_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text := upper(trim(coalesce(new.raw_user_meta_data->>'invite', '')));
begin
  update public.invites set used_by = new.id, used_at = now() where code = c and used_by is null;
  if not found then raise exception 'CafeNoct is invite-only. That invite code is missing or already used.'; end if;
  return new;
end $$;
drop trigger if exists require_invite on auth.users;
create trigger require_invite before insert on auth.users for each row execute function public.require_invite();

-- Feedback from inside the app.
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  page       text not null default '',
  mood       text not null default '',
  body       text not null,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy "feedback own insert" on public.feedback for insert with check (user_id = auth.uid());
create policy "feedback own select" on public.feedback for select using (user_id = auth.uid());
