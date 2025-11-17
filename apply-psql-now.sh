#!/bin/bash

# Quick psql migration application
# Uses password provided and prompts for other connection details

set -e

cd "$(dirname "$0")"

PASSWORD="Zacprovost87@"

echo "🚀 Apply Supabase Migrations with psql"
echo "======================================="
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql is not installed."
    echo "   Install with: brew install postgresql (on macOS)"
    exit 1
fi

echo "📋 We need your Supabase project details to connect."
echo ""
echo "Get them from: https://app.supabase.com"
echo "  1. Go to your project"
echo "  2. Settings → Database"
echo "  3. Connection string → URI"
echo ""

read -p "Enter your Supabase project reference (the part after 'db.' in the host): " PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo "❌ Project reference is required"
    exit 1
fi

read -p "Enter database name (usually 'postgres'): " DB_NAME
DB_NAME=${DB_NAME:-postgres}

read -p "Enter port (usually 5432 for direct, 6543 for pooler): " PORT
PORT=${PORT:-5432}

# Construct connection string
# Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:[PORT]/[DB_NAME]
CONNECTION_STRING="postgresql://postgres:${PASSWORD}@db.${PROJECT_REF}.supabase.co:${PORT}/${DB_NAME}"

echo ""
echo "📤 Applying migrations..."
echo "Connection: postgresql://postgres:***@db.${PROJECT_REF}.supabase.co:${PORT}/${DB_NAME}"
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



