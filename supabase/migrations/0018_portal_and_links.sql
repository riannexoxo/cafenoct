-- Rebuild: client portal, approval links, booking page and intake forms. Additive only.
--
-- Access design
-- * Every table below keeps owner-only RLS (user_id = auth.uid(), authenticated role). No table gets a client or
--   public policy.
-- * A client never reads tables directly. They call a handful of SECURITY DEFINER functions that first prove access
--   (an active portal_access row for this client account, or an unexpired 48-character link token) and then return
--   only that one client's rows from that one owner. Every function pins search_path = '' and is granted to exactly
--   the roles that need it.
-- * Booking and intake pages are public by design: they can only insert one event or one task for the page's owner,
--   with length checks and an hourly cap.

-- ---------- tables ----------
create table if not exists public.portal_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade, -- the VA
  client_id   uuid not null references public.clients on delete cascade,
  email       text not null default '' check (char_length(email) <= 254),
  invite_code text unique,                                   -- set by the server when the invite is sent
  member_id   uuid references auth.users on delete cascade,  -- the client's account, once they sign up
  status      text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists portal_access_member_idx on public.portal_access (member_id) where member_id is not null;

create table if not exists public.share_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  entity      text not null check (entity in ('deliverable', 'post')),
  entity_id   uuid not null,
  client_id   uuid references public.clients on delete cascade,
  expires_at  timestamptz not null default now() + interval '30 days',
  revoked     boolean not null default false,
  decision    text not null default '' check (decision in ('', 'approved', 'changes')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.booking_pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  title        text not null default 'Discovery call' check (char_length(title) between 1 and 80),
  intro        text not null default '' check (char_length(intro) <= 1000),
  duration_min integer not null default 30 check (duration_min between 15 and 240),
  days         smallint[] not null default '{1,2,3,4,5}',
  day_start    time not null default '09:00',
  day_end      time not null default '17:00',
  tz           text not null default 'UTC',
  notice_hours integer not null default 12 check (notice_hours between 0 and 336),
  horizon_days integer not null default 30 check (horizon_days between 1 and 90),
  client_id    uuid references public.clients on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (day_end > day_start)
);

create table if not exists public.intake_forms (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  title      text not null default 'Send a request' check (char_length(title) between 1 and 80),
  intro      text not null default '' check (char_length(intro) <= 1000),
  client_id  uuid references public.clients on delete set null,
  project_id uuid references public.projects on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['portal_access', 'share_links', 'booking_pages', 'intake_forms'] loop
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

-- ---------- internal: apply a client's decision (not callable by anyone directly) ----------
create or replace function public.cn_client_decision(
  p_owner uuid, p_client uuid, p_entity text, p_id uuid, p_decision text, p_comment text, p_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_title text; v_kind text; v_href text; v_who text := coalesce(nullif(btrim(p_name), ''), 'Your client');
begin
  if p_entity = 'deliverable' then
    select coalesce(nullif(title, ''), 'a request'), kind into v_title, v_kind from public.deliverables where id = p_id and user_id = p_owner;
    v_href := case v_kind when 'video' then '/edits' else '/designs' end;
    if p_decision = 'approve' then
      update public.deliverables set status = 'approved' where id = p_id and user_id = p_owner and status <> 'delivered';
    elsif p_decision = 'changes' then
      update public.deliverables set status = 'revisions', revisions = revisions + 1 where id = p_id and user_id = p_owner;
    end if;
  else
    select coalesce(nullif(title, ''), left(caption, 60), 'a post') into v_title from public.posts where id = p_id and user_id = p_owner;
    v_href := '/content';
    if p_decision = 'approve' then
      update public.posts set status = 'Scheduled' where id = p_id and user_id = p_owner and status = 'For approval';
    elsif p_decision = 'changes' then
      update public.posts set status = 'Drafting' where id = p_id and user_id = p_owner and status in ('For approval', 'Scheduled');
    end if;
  end if;
  if v_title is null then raise exception 'Not found' using errcode = 'P0002'; end if;

  if btrim(coalesce(p_comment, '')) <> '' then
    insert into public.comments (user_id, entity, entity_id, client_id, author, author_name, body, shared)
    values (p_owner, p_entity, p_id, p_client, 'client', left(v_who, 80), btrim(p_comment), true);
  end if;

  insert into public.notifications (user_id, kind, title, body, href, entity, entity_id, client_id)
  values (
    p_owner,
    case p_decision when 'approve' then 'approval' when 'changes' then 'changes' else 'comment' end,
    left(v_who || case p_decision when 'approve' then ' approved ' when 'changes' then ' asked for changes on ' else ' commented on ' end || '"' || v_title || '"', 300),
    left(coalesce(btrim(p_comment), ''), 1000), v_href, p_entity, p_id, p_client
  );
end $$;
revoke all on function public.cn_client_decision(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;

-- ---------- client portal (signed-in client accounts) ----------
create or replace function public.portal_clients()
returns table (client_id uuid, name text, company text, color text, logo_url text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.company, c.color, c.logo_url, coalesce(nullif(p.business, ''), p.name)
  from public.portal_access a
  join public.clients c on c.id = a.client_id and c.user_id = a.user_id
  left join public.profiles p on p.user_id = a.user_id
  where a.member_id = (select auth.uid()) and a.status = 'active';
$$;

create or replace function public.portal_data(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select a.user_id into v_owner from public.portal_access a
  where a.client_id = p_client and a.member_id = (select auth.uid()) and a.status = 'active' limit 1;
  if v_owner is null then raise exception 'No access' using errcode = '42501'; end if;

  return jsonb_build_object(
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'color', c.color, 'logo_url', c.logo_url)
               from public.clients c where c.id = p_client and c.user_id = v_owner),
    'owner', (select coalesce(nullif(p.business, ''), p.name) from public.profiles p where p.user_id = v_owner),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'status', pr.status, 'start_date', pr.start_date, 'due_date', pr.due_date, 'description', pr.description,
        'tasks_total', (select count(*) from public.tasks t where t.project_id = pr.id and t.user_id = v_owner),
        'tasks_done', (select count(*) from public.tasks t where t.project_id = pr.id and t.user_id = v_owner and t.status = 'done'),
        'milestones', (select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'due_date', t.due_date, 'done', t.status = 'done') order by t.due_date nulls last), '[]'::jsonb)
                       from public.tasks t where t.project_id = pr.id and t.user_id = v_owner and t.milestone),
        'update', (select jsonb_build_object('state', u.state, 'body', u.body, 'created_at', u.created_at)
                   from public.project_updates u where u.project_id = pr.id and u.user_id = v_owner order by u.created_at desc limit 1)
      ) order by pr.created_at desc), '[]'::jsonb)
      from public.projects pr where pr.client_id = p_client and pr.user_id = v_owner
        and (pr.status <> 'Done' or pr.updated_at > now() - interval '60 days')),
    'deliverables', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'title', d.title, 'type', d.type, 'size', d.size, 'length', d.length, 'status', d.status,
        'brief', d.brief, 'links', d.links, 'files', d.files, 'due_date', d.due_date, 'delivered_at', d.delivered_at,
        'revisions', d.revisions, 'max_revisions', d.max_revisions
      ) order by d.created_at desc), '[]'::jsonb)
      from public.deliverables d where d.client_id = p_client and d.user_id = v_owner and (d.delivered_at is null or d.delivered_at > now() - interval '90 days')),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', po.id, 'title', po.title, 'caption', po.caption, 'hashtags', po.hashtags, 'platforms', po.platforms, 'format', po.format,
        'publish_on', po.publish_on, 'publish_at', po.publish_at, 'status', po.status, 'media', po.media, 'post_urls', po.post_urls
      ) order by po.publish_on nulls last), '[]'::jsonb)
      from public.posts po where po.client_id = p_client and po.user_id = v_owner and po.status in ('For approval', 'Scheduled', 'Posted')
        and (po.publish_on is null or po.publish_on >= current_date - 45)),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'issue_date', i.issue_date, 'due_date', i.due_date, 'currency', i.currency,
        'status', i.status, 'items', i.items, 'paid_date', i.paid_date
      ) order by i.issue_date desc), '[]'::jsonb)
      from public.invoices i where i.client_id = p_client and i.user_id = v_owner and i.status in ('sent', 'paid')),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', cm.id, 'entity', cm.entity, 'entity_id', cm.entity_id, 'author', cm.author, 'author_name', cm.author_name,
        'body', cm.body, 'created_at', cm.created_at
      ) order by cm.created_at), '[]'::jsonb)
      from public.comments cm where cm.client_id = p_client and cm.user_id = v_owner and cm.shared)
  );
end $$;

create or replace function public.portal_decide(p_entity text, p_id uuid, p_decision text, p_comment text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_client uuid; v_name text;
begin
  if p_entity not in ('deliverable', 'post') or p_decision not in ('approve', 'changes', 'comment') then
    raise exception 'Bad request' using errcode = '22023'; end if;
  if char_length(coalesce(p_comment, '')) > 4000 then raise exception 'That comment is too long' using errcode = '22023'; end if;
  if p_decision <> 'approve' and btrim(coalesce(p_comment, '')) = '' then raise exception 'Add a comment first' using errcode = '22023'; end if;

  if p_entity = 'deliverable' then select user_id, client_id into v_owner, v_client from public.deliverables where id = p_id;
  else select user_id, client_id into v_owner, v_client from public.posts where id = p_id; end if;

  select coalesce(nullif(pf.name, ''), nullif(a.email, '')) into v_name
  from public.portal_access a left join public.profiles pf on pf.user_id = a.member_id
  where a.client_id = v_client and a.user_id = v_owner and a.member_id = (select auth.uid()) and a.status = 'active' limit 1;
  if v_client is null or not found then raise exception 'No access' using errcode = '42501'; end if;

  perform public.cn_client_decision(v_owner, v_client, p_entity, p_id, p_decision, p_comment, v_name);
end $$;

-- ---------- approval links (no account needed) ----------
create or replace function public.share_view(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.share_links%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into s from public.share_links where token = p_token and not revoked and expires_at > now();
  if not found then return null; end if;
  return jsonb_build_object(
    'entity', s.entity, 'decision', s.decision, 'decided_at', s.decided_at, 'expires_at', s.expires_at,
    'owner', (select coalesce(nullif(p.business, ''), p.name) from public.profiles p where p.user_id = s.user_id),
    'client', (select coalesce(nullif(c.company, ''), c.name) from public.clients c where c.id = s.client_id and c.user_id = s.user_id),
    'item', case when s.entity = 'deliverable' then
        (select jsonb_build_object('title', d.title, 'kind', d.kind, 'type', d.type, 'size', d.size, 'length', d.length, 'status', d.status,
                                   'brief', d.brief, 'links', d.links, 'files', d.files, 'due_date', d.due_date)
         from public.deliverables d where d.id = s.entity_id and d.user_id = s.user_id)
      else
        (select jsonb_build_object('title', po.title, 'caption', po.caption, 'hashtags', po.hashtags, 'platforms', po.platforms,
                                   'format', po.format, 'publish_on', po.publish_on, 'publish_at', po.publish_at, 'status', po.status, 'media', po.media)
         from public.posts po where po.id = s.entity_id and po.user_id = s.user_id)
      end,
    'comments', (select coalesce(jsonb_agg(jsonb_build_object('author', cm.author, 'author_name', cm.author_name, 'body', cm.body, 'created_at', cm.created_at) order by cm.created_at), '[]'::jsonb)
                 from public.comments cm where cm.user_id = s.user_id and cm.entity = s.entity and cm.entity_id = s.entity_id and cm.shared)
  );
end $$;

create or replace function public.share_decide(p_token text, p_decision text, p_comment text default '', p_name text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare s public.share_links%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'This link is not valid' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'changes', 'comment') then raise exception 'Bad request' using errcode = '22023'; end if;
  if char_length(coalesce(p_comment, '')) > 4000 or char_length(coalesce(p_name, '')) > 80 then raise exception 'That is too long' using errcode = '22023'; end if;
  if p_decision <> 'approve' and btrim(coalesce(p_comment, '')) = '' then raise exception 'Add a comment first' using errcode = '22023'; end if;

  select * into s from public.share_links where token = p_token and not revoked and expires_at > now() for update;
  if not found then raise exception 'This link has expired' using errcode = '42501'; end if;
  if (select count(*) from public.comments c where c.user_id = s.user_id and c.entity_id = s.entity_id and c.author = 'client'
      and c.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many comments in a short time. Please try again later.' using errcode = '54000'; end if;

  perform public.cn_client_decision(s.user_id, s.client_id, s.entity, s.entity_id, p_decision, p_comment, p_name);
  if p_decision <> 'comment' then
    update public.share_links set decision = case p_decision when 'approve' then 'approved' else 'changes' end, decided_at = now() where id = s.id;
  end if;
end $$;

-- ---------- booking page (public) ----------
-- Busy times for one owner between two moments: one-off events plus every showing of repeating series,
-- following the same repeat rules as the app's calendar. Internal only.
create or replace function public.cn_busy(p_owner uuid, p_from timestamptz, p_to timestamptz, p_fallback_tz text)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.starts_at, e.ends_at from public.events e
  where e.user_id = p_owner and e.repeat = 'none' and e.starts_at < p_to and e.ends_at > p_from
  union all
  select o.s, o.s + (e.ends_at - e.starts_at)
  from public.events e
  cross join lateral (select coalesce(nullif(e.tz, ''), p_fallback_tz) as tz) z
  cross join lateral generate_series(((p_from - (e.ends_at - e.starts_at)) at time zone z.tz)::date::timestamp,
                                     (p_to at time zone z.tz)::date::timestamp, interval '1 day') g(d)
  cross join lateral (select ((g.d::date + (e.starts_at at time zone z.tz)::time) at time zone z.tz) as s) o
  where e.user_id = p_owner and e.repeat <> 'none'
    and g.d::date >= (e.starts_at at time zone z.tz)::date
    and (e.repeat_until is null or g.d::date <= e.repeat_until)
    and not (g.d::date = any (e.skip_dates))
    and case e.repeat
          when 'daily' then true
          when 'weekdays' then extract(isodow from g.d) <= 5
          when 'weekly' then case when cardinality(e.repeat_days) > 0 then extract(isodow from g.d)::smallint = any (e.repeat_days)
                                  else extract(isodow from g.d) = extract(isodow from (e.starts_at at time zone z.tz)) end
          when 'monthly' then extract(day from g.d) = extract(day from (e.starts_at at time zone z.tz))
          else false
        end
    and o.s < p_to and o.s + (e.ends_at - e.starts_at) > p_from;
$$;
revoke all on function public.cn_busy(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;

create or replace function public.booking_info(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b public.booking_pages%rowtype;
begin
  select * into b from public.booking_pages where slug = lower(p_slug) and active;
  if not found then return null; end if;
  return jsonb_build_object(
    'title', b.title, 'intro', b.intro, 'duration_min', b.duration_min, 'days', b.days, 'day_start', b.day_start, 'day_end', b.day_end,
    'tz', b.tz, 'notice_hours', b.notice_hours, 'horizon_days', b.horizon_days,
    'owner', (select coalesce(nullif(p.business, ''), p.name) from public.profiles p where p.user_id = b.user_id),
    -- Only start and end times leave the database: never titles or notes.
    'busy', (select coalesce(jsonb_agg(jsonb_build_array(x.starts_at, x.ends_at) order by x.starts_at), '[]'::jsonb)
             from public.cn_busy(b.user_id, now(), now() + make_interval(days => b.horizon_days), b.tz) x)
  );
end $$;

create or replace function public.booking_create(p_slug text, p_start timestamptz, p_name text, p_email text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.booking_pages%rowtype; v_end timestamptz; v_local timestamp; v_id uuid;
  v_name text := btrim(coalesce(p_name, '')); v_email text := lower(btrim(coalesce(p_email, ''))); v_note text := btrim(coalesce(p_note, ''));
begin
  select * into b from public.booking_pages where slug = lower(p_slug) and active;
  if not found then raise exception 'This booking page is not available' using errcode = 'P0002'; end if;
  if char_length(v_name) not between 1 and 80 or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_note) > 1000 then
    raise exception 'Please check your name and email' using errcode = '22023'; end if;

  v_end := p_start + make_interval(mins => b.duration_min);
  v_local := p_start at time zone b.tz;
  if p_start < now() + make_interval(hours => b.notice_hours) or p_start > now() + make_interval(days => b.horizon_days)
     or not (extract(isodow from v_local)::smallint = any (b.days))
     or v_local::time < b.day_start or (v_end at time zone b.tz)::time > b.day_end or (v_end at time zone b.tz)::date <> v_local::date
     or extract(epoch from (v_local::time - b.day_start))::integer % 900 <> 0 then
    raise exception 'That time is not available' using errcode = '22023'; end if;

  -- One booking at a time per owner, so two people can never take the same slot.
  perform pg_advisory_xact_lock(hashtextextended('booking:' || b.user_id::text, 0));
  if exists (select 1 from public.cn_busy(b.user_id, p_start, v_end, b.tz)) then
    raise exception 'That time was just taken. Please pick another.' using errcode = '23P01'; end if;
  if (select count(*) from public.notifications n where n.user_id = b.user_id and n.kind = 'booking' and n.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many bookings right now. Please try again later.' using errcode = '54000'; end if;

  insert into public.events (user_id, client_id, title, starts_at, ends_at, notes, kind, tz)
  values (b.user_id, b.client_id, left(b.title || ' · ' || v_name, 200), p_start, v_end,
          concat_ws(E'\n', 'Booked by ' || v_name || ' <' || v_email || '>', nullif(v_note, '')), 'meeting', b.tz)
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, href, entity, entity_id, client_id)
  values (b.user_id, 'booking', left(v_name || ' booked ' || b.title, 300), to_char(v_local, 'Dy DD Mon, HH24:MI') || ' (' || b.tz || ')',
          '/calendar', 'event', v_id, b.client_id);
  return jsonb_build_object('starts_at', p_start, 'ends_at', v_end);
end $$;

-- ---------- intake forms (public): a submission becomes a task ----------
create or replace function public.intake_info(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('title', f.title, 'intro', f.intro,
    'owner', (select coalesce(nullif(p.business, ''), p.name) from public.profiles p where p.user_id = f.user_id))
  from public.intake_forms f where f.slug = lower(p_slug) and f.active;
$$;

create or replace function public.intake_submit(p_slug text, p_name text, p_email text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.intake_forms%rowtype; v_id uuid;
  v_name text := btrim(coalesce(p_name, '')); v_email text := lower(btrim(coalesce(p_email, ''))); v_msg text := btrim(coalesce(p_message, ''));
begin
  select * into f from public.intake_forms where slug = lower(p_slug) and active;
  if not found then raise exception 'This form is not available' using errcode = 'P0002'; end if;
  if char_length(v_name) not between 1 and 80 or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_msg) not between 1 and 4000 then
    raise exception 'Please fill in your name, email and request' using errcode = '22023'; end if;
  if (select count(*) from public.notifications n where n.user_id = f.user_id and n.kind = 'intake' and n.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many requests right now. Please try again later.' using errcode = '54000'; end if;

  insert into public.tasks (user_id, client_id, project_id, title, notes, status)
  values (f.user_id, f.client_id, f.project_id, left('Request: ' || split_part(v_msg, E'\n', 1), 200),
          'From ' || v_name || ' <' || v_email || '> via "' || f.title || '"' || E'\n\n' || v_msg, 'todo')
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, href, entity, entity_id, client_id)
  values (f.user_id, 'intake', left('New request from ' || v_name, 300), left(v_msg, 1000), '/work', 'task', v_id, f.client_id);
end $$;

-- ---------- who may call what ----------
revoke all on function public.portal_clients() from public, anon;
revoke all on function public.portal_data(uuid) from public, anon;
revoke all on function public.portal_decide(text, uuid, text, text) from public, anon;
grant execute on function public.portal_clients() to authenticated;
grant execute on function public.portal_data(uuid) to authenticated;
grant execute on function public.portal_decide(text, uuid, text, text) to authenticated;

revoke all on function public.share_view(text) from public;
revoke all on function public.share_decide(text, text, text, text) from public;
revoke all on function public.booking_info(text) from public;
revoke all on function public.booking_create(text, timestamptz, text, text, text) from public;
revoke all on function public.intake_info(text) from public;
revoke all on function public.intake_submit(text, text, text, text) from public;
grant execute on function public.share_view(text) to anon, authenticated;
grant execute on function public.share_decide(text, text, text, text) to anon, authenticated;
grant execute on function public.booking_info(text) to anon, authenticated;
grant execute on function public.booking_create(text, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.intake_info(text) to anon, authenticated;
grant execute on function public.intake_submit(text, text, text, text) to anon, authenticated;
