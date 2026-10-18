-- How many times you left the Focus tab during a focus session.
alter table public.time_entries add column if not exists leaves integer not null default 0;
