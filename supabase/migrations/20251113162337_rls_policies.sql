-- Row Level Security policies for Fiscalia tables.
-- Enable RLS and ensure each user only sees their own records.

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.conversations enable row level security;

-- Profiles -------------------------------------------------------------------
drop policy if exists "Profiles are viewable by owners" on public.profiles;
create policy "Profiles are viewable by owners"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Profiles are updatable by owners" on public.profiles;
create policy "Profiles are updatable by owners"
on public.profiles
for update
using (auth.uid() = id);

drop policy if exists "Profiles are insertable by owners" on public.profiles;
create policy "Profiles are insertable by owners"
on public.profiles
for insert
with check (auth.uid() = id);

-- Jobs -----------------------------------------------------------------------
drop policy if exists "Jobs are viewable by owners" on public.jobs;
create policy "Jobs are viewable by owners"
on public.jobs
for select
using (auth.uid() = user_id);

drop policy if exists "Jobs are insertable by owners" on public.jobs;
create policy "Jobs are insertable by owners"
on public.jobs
for insert
with check (auth.uid() = user_id);

drop policy if exists "Jobs are updatable by owners" on public.jobs;
create policy "Jobs are updatable by owners"
on public.jobs
for update
using (auth.uid() = user_id);

drop policy if exists "Jobs are deletable by owners" on public.jobs;
create policy "Jobs are deletable by owners"
on public.jobs
for delete
using (auth.uid() = user_id);

-- Categories -----------------------------------------------------------------
drop policy if exists "Categories are viewable by owners" on public.categories;
create policy "Categories are viewable by owners"
on public.categories
for select
using (auth.uid() = user_id);

drop policy if exists "Categories are mutable by owners" on public.categories;
create policy "Categories are mutable by owners"
on public.categories
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Expenses -------------------------------------------------------------------
drop policy if exists "Expenses are viewable by owners" on public.expenses;
create policy "Expenses are viewable by owners"
on public.expenses
for select
using (auth.uid() = user_id);

drop policy if exists "Expenses are mutable by owners" on public.expenses;
create policy "Expenses are mutable by owners"
on public.expenses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Notifications --------------------------------------------------------------
drop policy if exists "Notifications are viewable by owners" on public.notifications;
create policy "Notifications are viewable by owners"
on public.notifications
for select
using (auth.uid() = user_id);

drop policy if exists "Notifications are mutable by owners" on public.notifications;
create policy "Notifications are mutable by owners"
on public.notifications
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Messages -------------------------------------------------------------------
drop policy if exists "Messages are viewable by owners" on public.messages;
create policy "Messages are viewable by owners"
on public.messages
for select
using (
  auth.uid() = user_id
  and (
    conversation_id is null
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  )
);

drop policy if exists "Messages are mutable by owners" on public.messages;
create policy "Messages are mutable by owners"
on public.messages
for all
using (
  auth.uid() = user_id
  and (
    conversation_id is null
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  )
)
with check (
  auth.uid() = user_id
  and (
    conversation_id is null
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  )
);

-- Conversations --------------------------------------------------------------
drop policy if exists "Conversations are viewable by owners" on public.conversations;
create policy "Conversations are viewable by owners"
on public.conversations
for select
using (auth.uid() = user_id);

drop policy if exists "Conversations are mutable by owners" on public.conversations;
create policy "Conversations are mutable by owners"
on public.conversations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

