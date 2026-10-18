-- Usual hours can be set in your own time instead of the client's (hours_tz), and a start time can differ by day.
alter table public.clients add column if not exists hours_tz text not null default '';      -- '' = the client's time zone
alter table public.clients add column if not exists day_starts jsonb not null default '{}'::jsonb; -- {"3": "08:00"} = Wednesdays start at 8:00
