-- Rebuild: the posting queue. Additive only.
-- posts.status keeps its existing values (Idea, Drafting, For approval, Scheduled, Posted). A failed publish attempt
-- is recorded here instead of a new status, so the existing check constraint stays untouched.
alter table public.posts add column if not exists publish_error text not null default '';
alter table public.posts add column if not exists published_at timestamptz;
