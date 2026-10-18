-- One-time: adds Rianne's four clients to the signed-in account (the only account in this project).
with me as (select user_id from public.profiles order by created_at limit 1)
insert into public.clients (user_id, name, company, status, rate, rate_type, currency, work_days, hours_per_day, weekly_hours, report_cadence, color, notes)
select me.user_id, c.* from me, (values
  ('Debbie Williams', 'Ask Debbie About Hair & Health', 'Active', 8::numeric, 'Hourly', 'USD', '{1,2,3,4,5}'::smallint[], 7::numeric, 35::numeric, 'Daily', '#976A4B', ''),
  ('Cindy David', 'David Insurance Group', 'Active', 4.25, 'Hourly', 'USD', '{1,2,3,4,5}'::smallint[], 4, 20, '', '#7F8FA6', ''),
  ('Donnie Geof', 'House Teflon', 'Active', null, 'No fixed rate', 'USD', '{2,4}'::smallint[], 2, 4, '', '#8C9A7B', ''),
  ('Loretta Dawn', 'Designs by Loretta Dawn', 'Active', 7, 'Hourly', 'USD', '{}'::smallint[], null, 15, '', '#B88A8A', '15 hours a week, no set days.')
) as c(name, company, status, rate, rate_type, currency, work_days, hours_per_day, weekly_hours, report_cadence, color, notes)
where not exists (select 1 from public.clients x where x.user_id = me.user_id);

update public.profiles set name = 'Rianne', weekly_goal = 74 where name = '';
