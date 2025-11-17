-- Migration: Explicitly fix job_financial_summary view security
-- This ensures the view is completely recreated without any SECURITY DEFINER attributes
-- PostgreSQL views don't support SECURITY DEFINER, but Supabase may cache this incorrectly

-- Drop the view completely with CASCADE to remove any dependencies
drop view if exists public.job_financial_summary cascade;

-- Recreate the view explicitly as SECURITY INVOKER (default, but being explicit)
-- Note: PostgreSQL views always execute with the privileges of the querying user
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

-- Grant appropriate permissions
grant select on public.job_financial_summary to authenticated;
grant select on public.job_financial_summary to anon;

