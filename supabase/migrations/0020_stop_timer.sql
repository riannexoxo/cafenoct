-- Rebuild: stopping a timer is one atomic step. The timer is claimed by deleting it, and the time entry is written
-- in the same transaction. If anything fails, both roll back; a second stop (double click, another device) finds
-- no timer and logs nothing. Runs as the signed-in person, so RLS still applies. Additive only.
create or replace function public.stop_timer(p_id uuid)
returns public.time_entries language plpgsql security invoker set search_path = '' as $$
declare t public.timers%rowtype; e public.time_entries%rowtype;
begin
  delete from public.timers where id = p_id and user_id = (select auth.uid()) returning * into t;
  if not found then raise exception 'This timer was already stopped' using errcode = 'P0002'; end if;
  insert into public.time_entries (user_id, client_id, task_id, started_at, minutes, note, source)
  values (t.user_id, t.client_id, t.task_id, t.started_at, greatest(1, round(extract(epoch from (now() - t.started_at)) / 60)::integer), t.note, 'timer')
  returning * into e;
  return e;
end $$;
revoke all on function public.stop_timer(uuid) from public, anon;
grant execute on function public.stop_timer(uuid) to authenticated;
