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
create policy "Profiles are viewable by owners"
on public.profiles
for select
using (auth.uid() = id);

create policy "Profiles are updatable by owners"
on public.profiles
for update
using (auth.uid() = id);

create policy "Profiles are insertable by owners"
on public.profiles
for insert
with check (auth.uid() = id);

-- Jobs -----------------------------------------------------------------------
create policy "Jobs are viewable by owners"
on public.jobs
for select
using (auth.uid() = user_id);

create policy "Jobs are insertable by owners"
on public.jobs
for insert
with check (auth.uid() = user_id);

create policy "Jobs are updatable by owners"
on public.jobs
for update
using (auth.uid() = user_id);

create policy "Jobs are deletable by owners"
on public.jobs
for delete
using (auth.uid() = user_id);

-- Categories -----------------------------------------------------------------
create policy "Categories are viewable by owners"
on public.categories
for select
using (auth.uid() = user_id);

create policy "Categories are mutable by owners"
on public.categories
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Expenses -------------------------------------------------------------------
create policy "Expenses are viewable by owners"
on public.expenses
for select
using (auth.uid() = user_id);

create policy "Expenses are mutable by owners"
on public.expenses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Notifications --------------------------------------------------------------
create policy "Notifications are viewable by owners"
on public.notifications
for select
using (auth.uid() = user_id);

create policy "Notifications are mutable by owners"
on public.notifications
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Messages -------------------------------------------------------------------
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
create policy "Conversations are viewable by owners"
on public.conversations
for select
using (auth.uid() = user_id);

create policy "Conversations are mutable by owners"
on public.conversations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


