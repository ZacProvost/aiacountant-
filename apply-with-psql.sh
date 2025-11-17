#!/bin/bash

# Apply Supabase Migrations using psql
# This script will help you connect and apply the migrations

set -e

cd "$(dirname "$0")"

echo "🚀 Apply Supabase Migrations with psql"
echo "======================================="
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql is not installed."
    echo "   Install PostgreSQL client tools to use psql"
    exit 1
fi

echo "📋 To apply migrations, you need your Supabase database connection string."
echo ""
echo "Get it from: https://app.supabase.com"
echo "  1. Go to your project"
echo "  2. Settings → Database"
echo "  3. Connection string → URI"
echo "  4. Copy the connection string"
echo ""

read -p "Enter your Supabase connection string (or press Enter to use environment variable PGDATABASE_URL): " CONNECTION_STRING

if [ -z "$CONNECTION_STRING" ]; then
    if [ -z "$PGDATABASE_URL" ]; then
        echo "❌ No connection string provided and PGDATABASE_URL is not set"
        exit 1
    fi
    CONNECTION_STRING="$PGDATABASE_URL"
fi

echo ""
echo "📤 Applying migrations..."
echo ""

# Apply the migration file
psql "$CONNECTION_STRING" -f apply-migrations.sql

echo ""
echo "✅ Migrations applied successfully!"
echo ""
echo "🔍 Verifying setup..."
echo ""

# Run verification queries
psql "$CONNECTION_STRING" -c "
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
"

echo ""
echo "✨ Done!"



