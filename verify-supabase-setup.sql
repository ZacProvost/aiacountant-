-- Verification Script for Supabase Receipt Setup
-- Run this in Supabase SQL Editor to verify everything is set up correctly

-- 1. Check if expenses table has required columns
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'expenses' 
AND column_name IN ('receipt_path', 'ocr_data')
ORDER BY column_name;

-- 2. Check if storage bucket exists
SELECT 
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets 
WHERE id = 'receipts';

-- 3. Check RLS policies on storage.objects
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND policyname LIKE '%receipt%'
ORDER BY policyname;

-- 4. Check indexes on expenses table
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'expenses' 
AND indexname IN ('expenses_receipt_path_idx', 'expenses_ocr_data_idx')
ORDER BY indexname;

-- 5. Check if get_receipt_url function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_receipt_url';

-- Summary
SELECT 
    'Expenses columns' as check_type,
    COUNT(*) as count,
    CASE 
        WHEN COUNT(*) = 2 THEN '✅ PASS'
        ELSE '❌ FAIL - Missing columns'
    END as status
FROM information_schema.columns 
WHERE table_name = 'expenses' 
AND column_name IN ('receipt_path', 'ocr_data')

UNION ALL

SELECT 
    'Storage bucket' as check_type,
    COUNT(*) as count,
    CASE 
        WHEN COUNT(*) = 1 THEN '✅ PASS'
        ELSE '❌ FAIL - Bucket not found'
    END as status
FROM storage.buckets 
WHERE id = 'receipts'

UNION ALL

SELECT 
    'RLS policies' as check_type,
    COUNT(*) as count,
    CASE 
        WHEN COUNT(*) = 4 THEN '✅ PASS'
        ELSE '❌ FAIL - Missing policies'
    END as status
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND policyname LIKE '%receipt%'

UNION ALL

SELECT 
    'Indexes' as check_type,
    COUNT(*) as count,
    CASE 
        WHEN COUNT(*) >= 1 THEN '✅ PASS'
        ELSE '❌ FAIL - Missing indexes'
    END as status
FROM pg_indexes 
WHERE tablename = 'expenses' 
AND indexname IN ('expenses_receipt_path_idx', 'expenses_ocr_data_idx')

UNION ALL

SELECT 
    'Functions' as check_type,
    COUNT(*) as count,
    CASE 
        WHEN COUNT(*) = 1 THEN '✅ PASS'
        ELSE '❌ FAIL - Function not found'
    END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_receipt_url';



