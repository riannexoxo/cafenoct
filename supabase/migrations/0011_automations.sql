-- Automations: reminders that reach your phone and Mac even when CafeNoct is closed.

-- Each device that said yes to notifications (your iPhone home-screen app, Chrome on the Mac).
create table if not exists public.push_subs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  device     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
create policy "push_subs own select" on public.push_subs for select using (user_id = auth.uid());
create policy "push_subs own insert" on public.push_subs for insert with check (user_id = auth.uid());
create policy "push_subs own update" on public.push_subs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_subs own delete" on public.push_subs for delete using (user_id = auth.uid());

-- Every reminder already sent, so each one goes out once.
create table if not exists public.automation_log (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  key     text not null,
  title   text not null default '',
  body    text not null default '',
  url     text not null default '',
  sent_at timestamptz not null default now(),
  unique (user_id, key)
);
alter table public.automation_log enable row level security;
create policy "automation_log own select" on public.automation_log for select using (user_id = auth.uid());
create policy "automation_log own delete" on public.automation_log for delete using (user_id = auth.uid());
create index if not exists automation_log_user_sent on public.automation_log (user_id, sent_at desc);

-- The every-5-minutes check. A random key is made here, kept in the Vault, and only the server can check it.
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cafenoct_cron_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cafenoct_cron_key', 'Lets pg_cron call /api/automations/run');
  end if;
end $$;

create or replace function public.cron_key_ok(k text) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cafenoct_cron_key' and decrypted_secret = k);
$$;
revoke all on function public.cron_key_ok(text) from public, anon, authenticated;
grant execute on function public.cron_key_ok(text) to service_role;

select cron.unschedule('cafenoct-automations') where exists (select 1 from cron.job where jobname = 'cafenoct-automations');
select cron.schedule('cafenoct-automations', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://cafenoct.vercel.app/api/automations/run',
    headers := jsonb_build_object('x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'cafenoct_cron_key')),
    timeout_milliseconds := 25000
  );
$$);
