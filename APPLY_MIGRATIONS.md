# Apply Supabase Migrations

This guide will help you apply all necessary Supabase migrations for the receipt management features.

## Option 1: Using Supabase CLI (Recommended)

### Prerequisites
1. Install Supabase CLI if not already installed:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

### Apply Migrations

#### If you have a linked project:
```bash
cd "/Users/zacprovost/Downloads/fiscalia (1)"
supabase db push
```

#### If you need to link your project first:
```bash
cd "/Users/zacprovost/Downloads/fiscalia (1)"
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## Option 2: Using Supabase Dashboard (Manual)

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **SQL Editor**
3. Run each migration file in this order:

### Step 1: Initial Schema (if not already applied)
Open and run: `supabase/migrations/20251113162336_initial_schema.sql`

### Step 2: RLS Policies (if not already applied)
Open and run: `supabase/migrations/20251113162337_rls_policies.sql`

### Step 3: OCR Data Column
Open and run: `supabase/migrations/20250115000000_add_ocr_data_to_expenses.sql`

### Step 4: Receipt Storage Setup
Open and run: `supabase/migrations/20251116000000_receipts_storage.sql`

## Option 3: Using the Deployment Script

Run the provided script:
```bash
cd "/Users/zacprovost/Downloads/fiscalia (1)"
./deploy-supabase.sh
```

## Verification

After applying migrations, verify everything is set up correctly:

1. **In Supabase Dashboard:**
   - Go to **SQL Editor**
   - Copy and paste the contents of `verify-supabase-setup.sql`
   - Run the query
   - All checks should show ✅ PASS

2. **Manual Checks:**
   - Go to **Storage** → Verify `receipts` bucket exists
   - Go to **Table Editor** → `expenses` table → Verify `receipt_path` and `ocr_data` columns exist
   - Go to **Authentication** → **Policies** → Verify 4 receipt-related policies exist

## What Gets Created

### Storage Bucket
- **Name:** `receipts`
- **Type:** Private (not public)
- **Size Limit:** 5MB per file
- **Allowed Types:** JPEG, JPG, PNG, WebP

### Database Columns
- `expenses.receipt_path` - Stores the file path in storage
- `expenses.ocr_data` - Stores OCR metadata as JSON

### RLS Policies
Four policies on `storage.objects`:
1. Users can upload their own receipts
2. Users can view their own receipts
3. Users can update their own receipts
4. Users can delete their own receipts

### Indexes
- `expenses_receipt_path_idx` - For faster receipt lookups
- `expenses_ocr_data_idx` - GIN index for JSON queries

### Functions
- `get_receipt_url(receipt_path)` - Generates signed URLs for receipts

## Troubleshooting

### Error: "Bucket already exists"
This is fine - the migration uses `ON CONFLICT DO NOTHING`, so it won't fail.

### Error: "Column already exists"
This is fine - migrations use `IF NOT EXISTS` clauses.

### Error: "Policy already exists"
You may need to drop existing policies first:
```sql
DROP POLICY IF EXISTS "Users can upload their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;
```
Then re-run the storage migration.

## Next Steps

After migrations are applied:
1. ✅ Test receipt upload in the application
2. ✅ Test receipt viewing in expense details
3. ✅ Test receipt deletion
4. ✅ Verify receipts are cleaned up when expenses are deleted



