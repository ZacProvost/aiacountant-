-- Add OCR data column to expenses table for storing receipt OCR metadata
-- This allows storing extracted text, confidence scores, and structured data
-- from receipt OCR processing

alter table public.expenses
add column if not exists ocr_data jsonb;
-- Add index for querying OCR data
create index if not exists expenses_ocr_data_idx 
on public.expenses using gin (ocr_data);
-- Add comment explaining the column
comment on column public.expenses.ocr_data is 
'Stores OCR metadata from receipt processing including extracted text, confidence score, and structured data (merchant, date, total, items, etc.)';
