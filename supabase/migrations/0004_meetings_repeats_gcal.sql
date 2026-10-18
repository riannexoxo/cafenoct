-- Meetings with links, repeating events, and a private Google Calendar address.
alter table public.events add column if not exists kind text not null default 'block' check (kind in ('block', 'meeting'));
alter table public.events add column if not exists link text not null default '';
alter table public.events add column if not exists repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly'));
alter table public.events add column if not exists repeat_days smallint[] not null default '{}'; -- for weekly: 1 = Monday ... 7 = Sunday
alter table public.events add column if not exists repeat_until date;
alter table public.events add column if not exists skip_dates date[] not null default '{}'; -- single occurrences removed from a series
alter table public.events add column if not exists tz text not null default '';                -- time zone the series repeats in
create index if not exists events_repeat_idx on public.events (user_id, repeat) where repeat <> 'none';

-- The "secret address in iCal format" from Google Calendar. Only you can read it (row level security).
alter table public.profiles add column if not exists gcal_url text not null default '';
