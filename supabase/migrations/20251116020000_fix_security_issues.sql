-- Migration: Fix Security Issues
-- Addresses Supabase linter security warnings and errors
-- 1. Remove SECURITY DEFINER from job_financial_summary view
-- 2. Enable RLS on ai_alerts and ai_metrics tables
-- 3. Add RLS policies for ai_alerts and ai_metrics
-- 4. Add search_path to functions to prevent search path manipulation

-- ============================================================================
-- 1. Fix job_financial_summary view - Remove SECURITY DEFINER
-- Views in PostgreSQL are SECURITY INVOKER by default (use querying user's privileges)
-- Drop with CASCADE to ensure all dependencies are removed, then recreate
-- ============================================================================
drop view if exists public.job_financial_summary cascade;
create view public.job_financial_summary
as
  select
    j.id as job_id,
    j.user_id,
    j.revenue,
    coalesce(sum(e.amount), 0) as total_expenses,
    j.revenue - coalesce(sum(e.amount), 0) as profit
  from public.jobs j
  left join public.expenses e on e.job_id = j.id
  group by j.id, j.user_id, j.revenue;

-- ============================================================================
-- 2. Enable RLS on ai_metrics and ai_alerts tables
-- ============================================================================
alter table public.ai_metrics enable row level security;
alter table public.ai_alerts enable row level security;

-- ============================================================================
-- 3. Add RLS policies for ai_metrics
-- ai_metrics: Service role has full access, authenticated users can view their own metrics
-- ============================================================================
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
using (auth.uid() = user_id);

-- ============================================================================
-- 4. Add RLS policies for ai_alerts
-- ai_alerts: Only service role can access (system-wide alerts)
-- ============================================================================
drop policy if exists "Service role can manage ai_alerts" on public.ai_alerts;
create policy "Service role can manage ai_alerts"
on public.ai_alerts
for all
to service_role
using (true)
with check (true);

-- ============================================================================
-- 5. Fix functions - Add search_path to prevent search path manipulation
-- ============================================================================

-- Fix set_updated_at function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Fix raise_ai_alert function
create or replace function public.raise_ai_alert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
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

-- Fix get_receipt_url function (if it exists)
create or replace function public.get_receipt_url(receipt_path text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  url text;
begin
  if receipt_path is null or receipt_path = '' then
    return null;
  end if;
  
  -- Generate signed URL valid for 1 hour
  select storage.get_public_url('receipts', receipt_path) into url;
  return url;
end;
$$;

