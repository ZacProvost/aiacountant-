# ✅ Apply Migrations Now

Since psql is not installed, here's the easiest way to apply the migrations:

## Method 1: Supabase Dashboard (Easiest - Recommended)

1. **Open your Supabase project:**
   https://app.supabase.com/project/eihqjpdpuavfioqijjlc

2. **Go to SQL Editor:**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy and paste the entire contents of:**
   `apply-migrations-direct.sql`

4. **Click "Run"** (or press Cmd/Ctrl + Enter)

5. **Verify the results** - You should see all checks showing ✅ PASS

## Method 2: Install psql and Run Script

If you prefer using psql:

```bash
# Install PostgreSQL client (includes psql)
brew install postgresql

# Then run:
cd "/Users/zacprovost/Downloads/fiscalia (1)"
psql "postgresql://postgres:Zacprovost87@@db.eihqjpdpuavfioqijjlc.supabase.co:5432/postgres" -f apply-migrations.sql
```

## What Will Be Created

✅ **Storage bucket:** `receipts` (private, 5MB limit)  
✅ **Database column:** `expenses.ocr_data` (JSONB for OCR metadata)  
✅ **Index:** `expenses_receipt_path_idx` (for faster lookups)  
✅ **Index:** `expenses_ocr_data_idx` (GIN index for JSON queries)  
✅ **4 RLS policies:** Secure access to receipts  
✅ **Function:** `get_receipt_url()` for generating signed URLs  

## Quick Link

**Direct SQL Editor Link:**
https://app.supabase.com/project/eihqjpdpuavfioqijjlc/sql/new

Just copy `apply-migrations-direct.sql` and paste it there!



