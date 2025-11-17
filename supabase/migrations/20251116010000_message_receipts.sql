-- Add receipt metadata to messages table so chat attachments persist

alter table public.messages
add column if not exists receipt_path text,
add column if not exists receipt_ocr jsonb;

create index if not exists messages_receipt_path_idx on public.messages (receipt_path);
create index if not exists messages_receipt_ocr_idx on public.messages using gin (receipt_ocr);




