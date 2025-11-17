-- Migration: Receipt Storage Setup
-- Creates storage bucket for receipt images with proper RLS policies

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

-- Note: RLS on storage.objects is already enabled by Supabase by default
-- No need to enable it manually

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

comment on function public.get_receipt_url is 'Generate a signed URL for a receipt image';


