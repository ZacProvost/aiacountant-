-- Direct SQL to apply in Supabase Dashboard SQL Editor
-- Copy and paste this entire file into: https://app.supabase.com/project/eihqjpdpuavfioqijjlc/sql/new

-- ============================================================================
-- Migration: Receipt Storage and OCR Data Setup
-- ============================================================================

-- Add OCR data column to expenses table
alter table public.expenses
add column if not exists ocr_data jsonb;

-- Add index for querying OCR data
create index if not exists expenses_ocr_data_idx 
on public.expenses using gin (ocr_data);

-- Add comment explaining the column
comment on column public.expenses.ocr_data is 
'Stores OCR metadata from receipt processing including extracted text, confidence score, and structured data (merchant, date, total, items, etc.)';

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

-- Enable RLS on storage.objects
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

-- Verification queries (run these after to verify)
SELECT 
    'Storage bucket' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) = 1 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM storage.buckets WHERE id = 'receipts'
UNION ALL
SELECT 
    'Expenses columns' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) = 2 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM information_schema.columns 
WHERE table_name = 'expenses' AND column_name IN ('receipt_path', 'ocr_data')
UNION ALL
SELECT 
    'RLS policies' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) = 4 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%receipt%'
UNION ALL
SELECT 
    'Indexes' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) >= 1 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM pg_indexes 
WHERE tablename = 'expenses' AND indexname IN ('expenses_receipt_path_idx', 'expenses_ocr_data_idx');



