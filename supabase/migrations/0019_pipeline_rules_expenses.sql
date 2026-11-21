-- Rebuild: pipeline board, status automations, expenses with receipts. Additive only.

create table if not exists public.pipeline_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  client_id  uuid references public.clients on delete set null,
  title      text not null check (char_length(title) between 1 and 120),
  stage      text not null default 'lead' check (stage in ('lead', 'discovery', 'proposal', 'active', 'paused', 'done')),
  value      numeric not null default 0 check (value >= 0),
  currency   text not null default 'USD',
  next_step  text not null default '' check (char_length(next_step) <= 300),
  next_date  date,
  contact    text not null default '' check (char_length(contact) <= 120),
  email      text not null default '' check (char_length(email) <= 254),
  tags       text[] not null default '{}',
  notes      text not null default '' check (char_length(notes) <= 4000),
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One pattern only: when a task, deliverable, invoice or project changes to a status, do one thing.
create table if not exists public.automation_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  preset       text not null default 'custom' check (char_length(preset) <= 40),
  active       boolean not null default true,
  source       text not null check (source in ('task', 'deliverable', 'invoice', 'project')),
  to_status    text not null check (char_length(to_status) between 1 and 40),
  action       text not null check (action in ('task', 'notify', 'move_card')),
  action_title text not null default '' check (char_length(action_title) <= 200),
  action_stage text not null default '' check (action_stage in ('', 'lead', 'discovery', 'proposal', 'active', 'paused', 'done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists automation_rules_match_idx on public.automation_rules (user_id, source, to_status) where active;

-- Expenses and receipts for the wallet.
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  spent_on     date not null default current_date,
  amount       numeric not null check (amount > 0),
  currency     text not null default 'USD',
  category     text not null default 'Other' check (char_length(category) between 1 and 40),
  vendor       text not null default '' check (char_length(vendor) <= 120),
  note         text not null default '' check (char_length(note) <= 1000),
  client_id    uuid references public.clients on delete set null,
  receipt_path text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['pipeline_cards', 'automation_rules', 'expenses'] loop
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

-- Runs the matching rules after a status change. It runs as the person making the change (not security definer),
-- only ever touches that row owner's data, and can never block the change itself: any failure is caught and
-- reported to the inbox instead.
create or replace function public.cn_run_rules() returns trigger language plpgsql set search_path = '' as $$
declare
  r record; src text := tg_argv[0]; v_row jsonb := to_jsonb(new);
  v_client uuid := nullif(v_row->>'client_id', '')::uuid; v_item text; v_cname text; v_title text;
begin
  if new.status is not distinct from old.status or pg_trigger_depth() > 2 then return new; end if;
  begin
    v_item := coalesce(v_row->>'title', v_row->>'name', v_row->>'number', '');
    select coalesce(nullif(c.company, ''), c.name) into v_cname from public.clients c where c.id = v_client and c.user_id = new.user_id;
    for r in select * from public.automation_rules ar
             where ar.user_id = new.user_id and ar.active and ar.source = src and ar.to_status = new.status loop
      v_title := left(replace(replace(coalesce(nullif(r.action_title, ''), '{item}'), '{item}', v_item), '{client}', coalesce(v_cname, 'client')), 200);
      if r.action = 'task' then
        insert into public.tasks (user_id, client_id, title, status) values (new.user_id, v_client, v_title, 'todo');
        insert into public.notifications (user_id, kind, title, body, href, client_id)
        values (new.user_id, 'automation', left('New task: ' || v_title, 300), 'Added by an automation', '/work', v_client);
      elsif r.action = 'notify' then
        insert into public.notifications (user_id, kind, title, href, entity, entity_id, client_id)
        values (new.user_id, case src when 'invoice' then 'invoice' else 'automation' end, v_title,
                case src when 'task' then '/work' when 'deliverable' then '/designs' when 'invoice' then '/invoices' else '/projects' end,
                src, new.id, v_client);
      elsif r.action = 'move_card' and v_client is not null and r.action_stage <> '' then
        update public.pipeline_cards set stage = r.action_stage where user_id = new.user_id and client_id = v_client;
        insert into public.notifications (user_id, kind, title, href, client_id)
        values (new.user_id, 'automation', left(coalesce(v_cname, 'Client') || ' moved to ' || r.action_stage, 300), '/pipeline', v_client);
      end if;
    end loop;
  exception when others then
    begin
      insert into public.notifications (user_id, kind, title, body) values (new.user_id, 'automation', 'An automation could not run', left(sqlerrm, 500));
    exception when others then null;
    end;
  end;
  return new;
end $$;
revoke all on function public.cn_run_rules() from public, anon, authenticated;

create trigger cn_rules after update of status on public.tasks for each row execute function public.cn_run_rules('task');
create trigger cn_rules after update of status on public.deliverables for each row execute function public.cn_run_rules('deliverable');
create trigger cn_rules after update of status on public.invoices for each row execute function public.cn_run_rules('invoice');
create trigger cn_rules after update of status on public.projects for each row execute function public.cn_run_rules('project');

-- Private receipts: each person's files live under a folder named with their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
create policy "receipts own read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
