-- Rebuild round 3: emoji reactions from clients on deliverables and posts (portal and approval links). Additive only:
-- one new table and new functions. portal_decide / share_decide and everything else stay exactly as they are.

create table if not exists public.reactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  entity     text not null check (entity in ('deliverable', 'post')),
  entity_id  uuid not null,
  client_id  uuid references public.clients on delete set null,
  emoji      text not null check (emoji in ('heart', 'fire', 'clap', 'smile', 'eyes')),
  who        text not null default '' check (char_length(who) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One of each emoji per person per item, so tapping twice doesn't count twice.
  unique (user_id, entity_id, emoji, who)
);
create index if not exists reactions_entity_idx on public.reactions (user_id, entity_id);

-- Owner-only, same as every other table (0016-0022 pattern). Clients never touch the table directly.
alter table public.reactions enable row level security;
create policy "reactions own select" on public.reactions for select to authenticated using (user_id = (select auth.uid()));
create policy "reactions own insert" on public.reactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reactions own update" on public.reactions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reactions own delete" on public.reactions for delete to authenticated using (user_id = (select auth.uid()));
create index if not exists reactions_user_idx on public.reactions (user_id);
create trigger touch before update on public.reactions for each row execute function public.touch_updated_at();
create trigger cn_client_owned before insert or update of client_id, user_id on public.reactions
  for each row execute function public.cn_client_owned();
alter publication supabase_realtime add table public.reactions;

-- ---------- internal: counts for one item, as {"heart": 2, "fire": 1} (not callable directly) ----------
create or replace function public.cn_reaction_counts(p_owner uuid, p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(emoji, n), '{}'::jsonb)
  from (select r.emoji, count(*) as n from public.reactions r where r.user_id = p_owner and r.entity_id = p_id group by r.emoji) x;
$$;
revoke all on function public.cn_reaction_counts(uuid, uuid) from public, anon, authenticated;

-- ---------- internal: add a client's reaction and tell the owner (not callable directly) ----------
create or replace function public.cn_client_react(p_owner uuid, p_client uuid, p_entity text, p_id uuid, p_emoji text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_title text; v_kind text; v_href text; v_who text := coalesce(nullif(btrim(p_name), ''), 'Your client'); v_new uuid;
begin
  if p_entity = 'deliverable' then
    select coalesce(nullif(title, ''), 'a request'), kind into v_title, v_kind from public.deliverables where id = p_id and user_id = p_owner;
    v_href := case v_kind when 'video' then '/edits' else '/designs' end;
  else
    select coalesce(nullif(title, ''), left(caption, 60), 'a post') into v_title from public.posts where id = p_id and user_id = p_owner;
    v_href := '/content';
  end if;
  if v_title is null then raise exception 'Not found' using errcode = 'P0002'; end if;

  insert into public.reactions (user_id, entity, entity_id, client_id, emoji, who)
  values (p_owner, p_entity, p_id, p_client, p_emoji, left(v_who, 80))
  on conflict (user_id, entity_id, emoji, who) do nothing
  returning id into v_new;

  if v_new is not null then
    insert into public.notifications (user_id, kind, title, body, href, entity, entity_id, client_id)
    values (p_owner, 'comment', left(v_who || ' reacted to "' || v_title || '"', 300),
      case p_emoji when 'heart' then '❤️' when 'fire' then '🔥' when 'clap' then '👏' when 'smile' then '😊' else '👀' end,
      v_href, p_entity, p_id, p_client);
  end if;
  return public.cn_reaction_counts(p_owner, p_id);
end $$;
revoke all on function public.cn_client_react(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;

-- ---------- client portal: same access check as portal_decide ----------
create or replace function public.portal_react(p_entity text, p_id uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_client uuid; v_name text;
begin
  if p_entity is null or p_entity not in ('deliverable', 'post') or p_emoji is null or p_emoji not in ('heart', 'fire', 'clap', 'smile', 'eyes') then
    raise exception 'Bad request' using errcode = '22023'; end if;

  if p_entity = 'deliverable' then select user_id, client_id into v_owner, v_client from public.deliverables where id = p_id;
  else select user_id, client_id into v_owner, v_client from public.posts where id = p_id; end if;

  select coalesce(nullif(pf.name, ''), nullif(a.email, '')) into v_name
  from public.portal_access a left join public.profiles pf on pf.user_id = a.member_id
  where a.client_id = v_client and a.user_id = v_owner and a.member_id = (select auth.uid()) and a.status = 'active' limit 1;
  if v_client is null or not found then raise exception 'No access' using errcode = '42501'; end if;

  if (select count(*) from public.notifications n where n.user_id = v_owner and n.entity_id = p_id
      and n.kind in ('approval', 'changes', 'comment') and n.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many updates in a short time. Please try again later.' using errcode = '54000'; end if;

  return public.cn_client_react(v_owner, v_client, p_entity, p_id, p_emoji, v_name);
end $$;

create or replace function public.portal_reactions(p_entity text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid; v_client uuid;
begin
  if p_entity is null or p_entity not in ('deliverable', 'post') then raise exception 'Bad request' using errcode = '22023'; end if;
  if p_entity = 'deliverable' then select user_id, client_id into v_owner, v_client from public.deliverables where id = p_id;
  else select user_id, client_id into v_owner, v_client from public.posts where id = p_id; end if;
  if v_client is null or not exists (select 1 from public.portal_access a
      where a.client_id = v_client and a.user_id = v_owner and a.member_id = (select auth.uid()) and a.status = 'active') then
    raise exception 'No access' using errcode = '42501'; end if;
  return public.cn_reaction_counts(v_owner, p_id);
end $$;

-- ---------- approval links: same token checks and hourly cap as share_decide ----------
create or replace function public.share_react(p_token text, p_emoji text, p_name text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.share_links%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'This link is not valid' using errcode = '42501'; end if;
  if p_emoji is null or p_emoji not in ('heart', 'fire', 'clap', 'smile', 'eyes') then raise exception 'Bad request' using errcode = '22023'; end if;
  if char_length(coalesce(p_name, '')) > 80 then raise exception 'That is too long' using errcode = '22023'; end if;

  select * into s from public.share_links where token = p_token and not revoked and expires_at > now() for update;
  if not found then raise exception 'This link has expired' using errcode = '42501'; end if;
  if (select count(*) from public.notifications n where n.user_id = s.user_id and n.entity_id = s.entity_id
      and n.kind in ('approval', 'changes', 'comment') and n.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many updates in a short time. Please try again later.' using errcode = '54000'; end if;

  return public.cn_client_react(s.user_id, s.client_id, s.entity, s.entity_id, p_emoji, p_name);
end $$;

create or replace function public.share_reactions(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.share_links%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into s from public.share_links where token = p_token and not revoked and expires_at > now();
  if not found then return null; end if;
  return public.cn_reaction_counts(s.user_id, s.entity_id);
end $$;

-- ---------- grants: portal functions to signed-in clients only, link functions also to anon (like share_*) ----------
revoke all on function public.portal_react(text, uuid, text) from public, anon;
revoke all on function public.portal_reactions(text, uuid) from public, anon;
grant execute on function public.portal_react(text, uuid, text) to authenticated;
grant execute on function public.portal_reactions(text, uuid) to authenticated;
revoke all on function public.share_react(text, text, text) from public;
revoke all on function public.share_reactions(text) from public;
grant execute on function public.share_react(text, text, text) to anon, authenticated;
grant execute on function public.share_reactions(text) to anon, authenticated;
