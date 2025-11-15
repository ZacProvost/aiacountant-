-- Supabase schema for Fiscalia secure data storage
-- Run this script with `supabase db push` or in the SQL editor.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Utility --------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles -------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  company_name text,
  tax_rate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists handle_profiles_updated_at on public.profiles;
create trigger handle_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

-- Conversations --------------------------------------------------------------
create table if not exists public.conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  has_user_message boolean not null default false,
  last_message_preview text,
  last_message_at timestamptz,
  memory_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_idx on public.conversations (user_id);
create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at desc);

drop trigger if exists handle_conversations_updated_at on public.conversations;
create trigger handle_conversations_updated_at
before update on public.conversations
for each row
execute procedure public.set_updated_at();

-- Jobs -----------------------------------------------------------------------
create table if not exists public.jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  client_name text,
  address text,
  description text,
  status text not null default 'En cours',
  revenue numeric not null default 0,
  expenses numeric not null default 0,
  profit numeric not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_id_idx on public.jobs (user_id);
create index if not exists jobs_status_idx on public.jobs (status);

drop trigger if exists handle_jobs_updated_at on public.jobs;
create trigger handle_jobs_updated_at
before update on public.jobs
for each row
execute procedure public.set_updated_at();

-- Categories -----------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists categories_user_id_name_key
on public.categories (user_id, name);

-- Expenses -------------------------------------------------------------------
create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text references public.jobs(id) on delete cascade,
  name text not null,
  amount numeric not null,
  category text not null,
  date date not null,
  vendor text,
  notes text,
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_id_idx on public.expenses (user_id);
create index if not exists expenses_job_id_idx on public.expenses (job_id);

drop trigger if exists handle_expenses_updated_at on public.expenses;
create trigger handle_expenses_updated_at
before update on public.expenses
for each row
execute procedure public.set_updated_at();

-- Notifications --------------------------------------------------------------
create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  type text not null,
  timestamp timestamptz not null default now(),
  read boolean not null default false,
  job_id text references public.jobs(id) on delete set null
);

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_read_idx on public.notifications (read);

-- Messages -------------------------------------------------------------------
create table if not exists public.messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text references public.conversations(id) on delete cascade,
  sender text not null,
  text text not null,
  timestamp timestamptz not null default now(),
  custom_title text,
  job_summary jsonb,
  retain boolean not null default true
);

create index if not exists messages_user_id_idx on public.messages (user_id);
create index if not exists messages_timestamp_idx on public.messages (timestamp desc);

-- Views ----------------------------------------------------------------------
create or replace view public.job_financial_summary as
  select
    j.id as job_id,
    j.user_id,
    j.revenue,
    coalesce(sum(e.amount), 0) as total_expenses,
    j.revenue - coalesce(sum(e.amount), 0) as profit
  from public.jobs j
  left join public.expenses e on e.job_id = j.id
  group by j.id;

-- AI Metrics -----------------------------------------------------------------
create table if not exists public.ai_metrics (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null,
  function_name text not null,
  duration_ms numeric not null,
  success boolean not null,
  user_id uuid,
  action_count integer,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_alerts (
  id uuid primary key default gen_random_uuid(),
  triggered_at timestamptz not null default now(),
  severity text not null,
  message text not null,
  error_rate numeric,
  window_minutes integer not null default 15
);

create or replace function public.raise_ai_alert()
returns trigger
language plpgsql
as $$
declare
  failures integer;
  total integer;
  error_ratio numeric;
  recent_alert_exists boolean;
begin
  select
    count(*) filter (where success = false),
    count(*)
  into failures, total
  from public.ai_metrics
  where created_at >= now() - interval '15 minutes';

  if total = 0 then
    return new;
  end if;

  error_ratio := failures::numeric / total::numeric;

  if total >= 5 and error_ratio >= 0.25 then
    select exists(
      select 1
      from public.ai_alerts
      where triggered_at >= now() - interval '15 minutes'
        and message like 'AI error rate%'
    ) into recent_alert_exists;

    if not recent_alert_exists then
      insert into public.ai_alerts (severity, message, error_rate)
      values (
        case
          when error_ratio >= 0.5 then 'critical'
          when error_ratio >= 0.35 then 'error'
          else 'warning'
        end,
        'AI error rate exceeded threshold over the last 15 minutes',
        error_ratio
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ai_metrics_alert_trigger on public.ai_metrics;
create trigger ai_metrics_alert_trigger
after insert on public.ai_metrics
for each row execute procedure public.raise_ai_alert();

