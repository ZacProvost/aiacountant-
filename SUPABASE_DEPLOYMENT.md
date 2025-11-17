# Supabase Deployment Requirements

This document outlines the Supabase changes needed to support the receipt management features.

## ✅ Already Implemented Migrations

The following migrations are already in your codebase and need to be applied:

### 1. Receipt Storage Bucket (`20251116000000_receipts_storage.sql`)
**Status:** ✅ Migration file exists

This migration:
- Creates the `receipts` storage bucket (private, 5MB limit)
- Sets up RLS policies for authenticated users to:
  - Upload their own receipts
  - View their own receipts
  - Update their own receipts
  - Delete their own receipts
- Adds index on `expenses.receipt_path` for faster lookups
- Creates `get_receipt_url()` function for generating signed URLs

**Action Required:** Run this migration if not already applied:
```bash
supabase migration up
```

### 2. Expenses Table Schema (`20251113162336_initial_schema.sql`)
**Status:** ✅ Migration file exists

The expenses table already includes:
- `receipt_path text` column for storing receipt file paths
- Proper indexes on `user_id` and `job_id`

**Action Required:** Ensure this migration has been applied.

### 3. OCR Data Column (`20250115000000_add_ocr_data_to_expenses.sql`)
**Status:** ✅ Migration file exists

Adds:
- `ocr_data jsonb` column for storing OCR metadata
- GIN index for efficient JSON queries

**Action Required:** Run this migration if not already applied.

## 🔍 Verification Steps

### 1. Check Storage Bucket Exists
```sql
SELECT * FROM storage.buckets WHERE id = 'receipts';
```

If empty, run the storage migration.

### 2. Verify RLS Policies
```sql
SELECT * FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname LIKE '%receipt%';
```

Should return 4 policies (insert, select, update, delete).

### 3. Check Expenses Table Schema
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'expenses' 
AND column_name IN ('receipt_path', 'ocr_data');
```

Should show both columns exist.

### 4. Test Storage Access
```sql
-- Test if bucket is accessible
SELECT * FROM storage.buckets WHERE id = 'receipts' AND public = false;
```

## 🚀 Deployment Steps

### Option 1: Using Supabase CLI (Recommended)
```bash
# Navigate to project root
cd /path/to/fiscalia

# Apply all pending migrations
supabase db push

# Or apply specific migration
supabase migration up
```

### Option 2: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run each migration file in order:
   - `20251113162336_initial_schema.sql`
   - `20251113162337_rls_policies.sql`
   - `20250115000000_add_ocr_data_to_expenses.sql`
   - `20251116000000_receipts_storage.sql`

### Option 3: Manual Storage Bucket Creation
If migrations fail, create the bucket manually:

1. Go to **Storage** in Supabase Dashboard
2. Click **New bucket**
3. Name: `receipts`
4. Public: **No** (private)
5. File size limit: `5242880` (5MB)
6. Allowed MIME types: `image/jpeg, image/jpg, image/png, image/webp`

Then run the RLS policies from the migration file.

## ⚠️ Important Notes

### Storage Policies
The RLS policies ensure users can only:
- Access receipts in folders matching their user ID (`auth.uid()`)
- Files are stored as: `{userId}/{expenseId}_{timestamp}.jpg`

### Receipt Path vs Receipt Image
- **Database:** Stores `receipt_path` (file path in storage)
- **Frontend:** Uses `receiptImage` (can be base64 or URL)
- **Mapping:** `financialService.ts` maps `receiptImage` → `receiptPath` when saving

### Cleanup on Deletion
When an expense is deleted:
1. The expense record is removed from the database
2. The associated receipt file is deleted from storage (via `receiptService.deleteReceipt()`)
3. This prevents orphaned files from consuming storage space

## 🔧 Troubleshooting

### Issue: "Bucket not found" error
**Solution:** Run the storage migration or create the bucket manually.

### Issue: "Permission denied" when uploading
**Solution:** Verify RLS policies are applied correctly. Check that:
- User is authenticated
- Policy allows insert on `storage.objects`
- File path starts with user's ID

### Issue: Receipts not displaying
**Solution:** 
1. Check if `receipt_path` is being saved correctly
2. Verify the file exists in storage
3. Check if signed URLs are being generated correctly

## 📋 Checklist

Before deploying to production:

- [ ] All migrations have been applied
- [ ] Storage bucket `receipts` exists and is private
- [ ] RLS policies are active on `storage.objects`
- [ ] `expenses` table has `receipt_path` and `ocr_data` columns
- [ ] Indexes are created (`expenses_receipt_path_idx`, `expenses_ocr_data_idx`)
- [ ] Test receipt upload works
- [ ] Test receipt deletion works
- [ ] Test receipt viewing works
- [ ] Verify storage cleanup on expense deletion

## 🔐 Security Considerations

1. **Private Bucket:** The `receipts` bucket is private (not public)
2. **RLS Policies:** Users can only access their own receipts
3. **Path Validation:** File paths are validated to ensure they're in the user's folder
4. **File Size Limits:** 5MB limit prevents abuse
5. **MIME Type Validation:** Only image types are allowed

## 📊 Storage Usage

Monitor storage usage:
- Each receipt is compressed before upload (target: ~1-2MB)
- Old receipts are cleaned up when expenses are deleted
- Consider implementing a cleanup job for orphaned files if needed



