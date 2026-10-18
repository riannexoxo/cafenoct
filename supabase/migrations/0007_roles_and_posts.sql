-- What you do for each client (roles decide which tools their portal shows), and your own personal portal.
alter table public.clients add column if not exists roles text[] not null default '{}';   -- smm, web, ea, design, video, live, code
alter table public.clients add column if not exists personal boolean not null default false; -- your own portal: no billing or hours

-- Content calendar: one post can go to several platforms, each with its own live link and numbers.
alter table public.posts add column if not exists platforms text[] not null default '{}';
alter table public.posts add column if not exists post_urls jsonb not null default '{}'::jsonb; -- {"Instagram": "https://..."}
alter table public.posts add column if not exists stats jsonb not null default '{}'::jsonb;     -- {"Instagram": {"views": 1200, "likes": 80}}
alter table public.posts add column if not exists hook text not null default '';
alter table public.posts add column if not exists pillar text not null default '';
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check check (status in ('Idea', 'Drafting', 'For approval', 'Scheduled', 'Posted'));
create index if not exists posts_client_date_idx on public.posts (user_id, client_id, publish_on);
