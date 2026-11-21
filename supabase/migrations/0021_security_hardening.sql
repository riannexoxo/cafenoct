-- Rebuild security hardening, from the overnight audit. Additive only: new trigger function + triggers on the new
-- tables, and two of tonight's own functions replaced with stricter versions. Existing data is not touched.

-- 1) A row's client (and project) must belong to the same owner. Without this, one account could point a portal,
--    share link, pipeline card, expense, booking page, intake form or comment at another account's client id.
--    Runs as the person writing the row (so RLS limits what it can see) and inside tonight's definer functions.
create or replace function public.cn_client_owned() returns trigger language plpgsql set search_path = '' as $$
declare v_project uuid;
begin
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.user_id = new.user_id) then
    raise exception 'That client is not in your workspace' using errcode = '42501';
  end if;
  if tg_table_name = 'intake_forms' then
    v_project := new.project_id;
    if v_project is not null and not exists (select 1 from public.projects p where p.id = v_project and p.user_id = new.user_id) then
      raise exception 'That project is not in your workspace' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.cn_client_owned() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['portal_access', 'share_links', 'pipeline_cards', 'expenses', 'booking_pages', 'intake_forms', 'comments'] loop
    execute format('drop trigger if exists cn_client_owned on public.%I', t);
    execute format('create trigger cn_client_owned before insert or update of client_id, user_id on public.%I for each row execute function public.cn_client_owned()', t);
  end loop;
end $$;
drop trigger if exists cn_project_owned on public.intake_forms;
create trigger cn_project_owned before update of project_id on public.intake_forms for each row execute function public.cn_client_owned();

-- 2) Clients can only decide on items that are actually waiting for them: a deliverable "With client" (review),
--    a post "For approval". Comments stay open on anything they can see.
create or replace function public.cn_client_decision(
  p_owner uuid, p_client uuid, p_entity text, p_id uuid, p_decision text, p_comment text, p_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_title text; v_kind text; v_status text; v_href text; v_who text := coalesce(nullif(btrim(p_name), ''), 'Your client');
begin
  if p_entity = 'deliverable' then
    select coalesce(nullif(title, ''), 'a request'), kind, status into v_title, v_kind, v_status from public.deliverables where id = p_id and user_id = p_owner;
    v_href := case v_kind when 'video' then '/edits' else '/designs' end;
  else
    select coalesce(nullif(title, ''), left(caption, 60), 'a post'), status into v_title, v_status from public.posts where id = p_id and user_id = p_owner;
    v_href := '/content';
  end if;
  if v_title is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if p_decision <> 'comment' and v_status not in ('review', 'For approval') then
    raise exception 'This item is not waiting for your approval right now' using errcode = '22023';
  end if;

  if p_entity = 'deliverable' then
    if p_decision = 'approve' then update public.deliverables set status = 'approved' where id = p_id and user_id = p_owner;
    elsif p_decision = 'changes' then update public.deliverables set status = 'revisions', revisions = revisions + 1 where id = p_id and user_id = p_owner;
    end if;
  else
    if p_decision = 'approve' then update public.posts set status = 'Scheduled' where id = p_id and user_id = p_owner;
    elsif p_decision = 'changes' then update public.posts set status = 'Drafting' where id = p_id and user_id = p_owner;
    end if;
  end if;

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

-- 3) Approval links: every action counts toward the hourly cap (not only comments), so a link can't flood the inbox.
create or replace function public.share_decide(p_token text, p_decision text, p_comment text default '', p_name text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare s public.share_links%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'This link is not valid' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approve', 'changes', 'comment') then raise exception 'Bad request' using errcode = '22023'; end if;
  if char_length(coalesce(p_comment, '')) > 4000 or char_length(coalesce(p_name, '')) > 80 then raise exception 'That is too long' using errcode = '22023'; end if;
  if p_decision <> 'approve' and btrim(coalesce(p_comment, '')) = '' then raise exception 'Add a comment first' using errcode = '22023'; end if;

  select * into s from public.share_links where token = p_token and not revoked and expires_at > now() for update;
  if not found then raise exception 'This link has expired' using errcode = '42501'; end if;
  if (select count(*) from public.notifications n where n.user_id = s.user_id and n.entity_id = s.entity_id
      and n.kind in ('approval', 'changes', 'comment') and n.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many updates in a short time. Please try again later.' using errcode = '54000'; end if;

  perform public.cn_client_decision(s.user_id, s.client_id, s.entity, s.entity_id, p_decision, p_comment, p_name);
  if p_decision <> 'comment' then
    update public.share_links set decision = case p_decision when 'approve' then 'approved' else 'changes' end, decided_at = now() where id = s.id;
  end if;
end $$;
revoke all on function public.share_decide(text, text, text, text) from public;
grant execute on function public.share_decide(text, text, text, text) to anon, authenticated;
