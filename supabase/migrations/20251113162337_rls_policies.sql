-- Row Level Security policies for Fiscalia tables.
-- Enable RLS and ensure each user only sees their own records.

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.conversations enable row level security;
alter table public.ai_metrics enable row level security;
alter table public.ai_alerts enable row level security;
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
-- Note: Only "mutable" policy needed since "for all" covers SELECT, INSERT, UPDATE, DELETE
drop policy if exists "Categories are viewable by owners" on public.categories;
drop policy if exists "Categories are mutable by owners" on public.categories;
create policy "Categories are mutable by owners"
on public.categories
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
-- Expenses -------------------------------------------------------------------
-- Note: Only "mutable" policy needed since "for all" covers SELECT, INSERT, UPDATE, DELETE
drop policy if exists "Expenses are viewable by owners" on public.expenses;
drop policy if exists "Expenses are mutable by owners" on public.expenses;
create policy "Expenses are mutable by owners"
on public.expenses
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
-- Notifications --------------------------------------------------------------
-- Note: Only "mutable" policy needed since "for all" covers SELECT, INSERT, UPDATE, DELETE
drop policy if exists "Notifications are viewable by owners" on public.notifications;
drop policy if exists "Notifications are mutable by owners" on public.notifications;
create policy "Notifications are mutable by owners"
on public.notifications
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
-- Messages -------------------------------------------------------------------
-- Note: Only "mutable" policy needed since "for all" covers SELECT, INSERT, UPDATE, DELETE
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
-- Note: Only "mutable" policy needed since "for all" covers SELECT, INSERT, UPDATE, DELETE
drop policy if exists "Conversations are viewable by owners" on public.conversations;
drop policy if exists "Conversations are mutable by owners" on public.conversations;
create policy "Conversations are mutable by owners"
on public.conversations
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
-- AI Metrics -----------------------------------------------------------------
drop policy if exists "Service role can manage ai_metrics" on public.ai_metrics;
create policy "Service role can manage ai_metrics"
on public.ai_metrics
for all
to service_role
using (true)
with check (true);
drop policy if exists "Users can view their own ai_metrics" on public.ai_metrics;
create policy "Users can view their own ai_metrics"
on public.ai_metrics
for select
to authenticated
using ((select auth.uid()) = user_id);
-- AI Alerts ------------------------------------------------------------------
drop policy if exists "Service role can manage ai_alerts" on public.ai_alerts;
create policy "Service role can manage ai_alerts"
on public.ai_alerts
for all
to service_role
using (true)
with check (true);
