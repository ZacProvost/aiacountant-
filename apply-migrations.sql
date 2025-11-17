-- Combined Supabase Migrations for Receipt Management
-- Run this script using psql to apply all necessary changes
-- 
-- Usage:
--   psql "postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres" -f apply-migrations.sql
-- 
-- Or get connection string from Supabase Dashboard:
--   Settings → Database → Connection string → URI

-- ============================================================================
-- Migration 1: Initial Schema (if not already applied)
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Utility function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Ensure expenses table exists with receipt_path column
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

-- ============================================================================
-- Migration 2: OCR Data Column
-- ============================================================================

-- Add OCR data column to expenses table for storing receipt OCR metadata
alter table public.expenses
add column if not exists ocr_data jsonb;

-- Add index for querying OCR data
create index if not exists expenses_ocr_data_idx 
on public.expenses using gin (ocr_data);

-- Add comment explaining the column
comment on column public.expenses.ocr_data is 
'Stores OCR metadata from receipt processing including extracted text, confidence score, and structured data (merchant, date, total, items, etc.)';

-- ============================================================================
-- Migration 3: Receipt Storage Setup
-- ============================================================================

-- Create storage bucket for receipts
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880, -- 5MB limit
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Enable RLS on storage.objects (if not already enabled)
alter table storage.objects enable row level security;

-- Drop existing policies if they exist (to avoid conflicts)
drop policy if exists "Users can upload their own receipts" on storage.objects;
drop policy if exists "Users can view their own receipts" on storage.objects;
drop policy if exists "Users can update their own receipts" on storage.objects;
drop policy if exists "Users can delete their own receipts" on storage.objects;

-- Policy: Users can upload their own receipts
create policy "Users can upload their own receipts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own receipts
create policy "Users can view their own receipts"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own receipts
create policy "Users can update their own receipts"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own receipts
create policy "Users can delete their own receipts"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Add index on receipt_path for faster lookups
create index if not exists expenses_receipt_path_idx on public.expenses (receipt_path);

-- Function to get receipt URL
create or replace function public.get_receipt_url(receipt_path text)
returns text
language plpgsql
security definer
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

comment on function public.get_receipt_url is 'Generate a signed URL for a receipt image';

-- ============================================================================
-- Verification Queries (run these after to verify)
-- ============================================================================

-- Uncomment to verify setup:
-- SELECT 'Storage bucket' as check_type, COUNT(*) as count FROM storage.buckets WHERE id = 'receipts';
-- SELECT 'Expenses columns' as check_type, COUNT(*) as count FROM information_schema.columns WHERE table_name = 'expenses' AND column_name IN ('receipt_path', 'ocr_data');
-- SELECT 'RLS policies' as check_type, COUNT(*) as count FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%receipt%';
-- SELECT 'Indexes' as check_type, COUNT(*) as count FROM pg_indexes WHERE tablename = 'expenses' AND indexname IN ('expenses_receipt_path_idx', 'expenses_ocr_data_idx');



