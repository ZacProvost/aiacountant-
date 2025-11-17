-- Fix RLS performance issues:
-- 1. Replace auth.uid() with (select auth.uid()) to cache results (auth_rls_initplan)
-- 2. Remove duplicate SELECT policies where "mutable" policies already cover SELECT (multiple_permissive_policies)

-- Profiles -------------------------------------------------------------------
drop policy if exists "Profiles are viewable by owners" on public.profiles;
create policy "Profiles are viewable by owners"
on public.profiles
for select
using ((select auth.uid()) = id);

drop policy if exists "Profiles are updatable by owners" on public.profiles;
create policy "Profiles are updatable by owners"
on public.profiles
for update
using ((select auth.uid()) = id);

drop policy if exists "Profiles are insertable by owners" on public.profiles;
create policy "Profiles are insertable by owners"
on public.profiles
for insert
with check ((select auth.uid()) = id);

-- Jobs -----------------------------------------------------------------------
drop policy if exists "Jobs are viewable by owners" on public.jobs;
create policy "Jobs are viewable by owners"
on public.jobs
for select
using ((select auth.uid()) = user_id);

drop policy if exists "Jobs are insertable by owners" on public.jobs;
create policy "Jobs are insertable by owners"
on public.jobs
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "Jobs are updatable by owners" on public.jobs;
create policy "Jobs are updatable by owners"
on public.jobs
for update
using ((select auth.uid()) = user_id);

drop policy if exists "Jobs are deletable by owners" on public.jobs;
create policy "Jobs are deletable by owners"
on public.jobs
for delete
using ((select auth.uid()) = user_id);

-- Categories -----------------------------------------------------------------
-- Remove duplicate "viewable" policy since "mutable" already covers SELECT
drop policy if exists "Categories are viewable by owners" on public.categories;

drop policy if exists "Categories are mutable by owners" on public.categories;
create policy "Categories are mutable by owners"
on public.categories
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Expenses -------------------------------------------------------------------
-- Remove duplicate "viewable" policy since "mutable" already covers SELECT
drop policy if exists "Expenses are viewable by owners" on public.expenses;

drop policy if exists "Expenses are mutable by owners" on public.expenses;
create policy "Expenses are mutable by owners"
on public.expenses
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Notifications --------------------------------------------------------------
-- Remove duplicate "viewable" policy since "mutable" already covers SELECT
drop policy if exists "Notifications are viewable by owners" on public.notifications;

drop policy if exists "Notifications are mutable by owners" on public.notifications;
create policy "Notifications are mutable by owners"
on public.notifications
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Messages -------------------------------------------------------------------
-- Remove duplicate "viewable" policy since "mutable" already covers SELECT
drop policy if exists "Messages are viewable by owners" on public.messages;

drop policy if exists "Messages are mutable by owners" on public.messages;
create policy "Messages are mutable by owners"
on public.messages
for all
using (
  (select auth.uid()) = user_id
  and (
    conversation_id is null
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  )
)
with check (
  (select auth.uid()) = user_id
  and (
    conversation_id is null
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  )
);

-- Conversations --------------------------------------------------------------
-- Remove duplicate "viewable" policy since "mutable" already covers SELECT
drop policy if exists "Conversations are viewable by owners" on public.conversations;

drop policy if exists "Conversations are mutable by owners" on public.conversations;
create policy "Conversations are mutable by owners"
on public.conversations
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- AI Metrics -----------------------------------------------------------------
drop policy if exists "Users can view their own ai_metrics" on public.ai_metrics;
create policy "Users can view their own ai_metrics"
on public.ai_metrics
for select
to authenticated
using ((select auth.uid()) = user_id);

