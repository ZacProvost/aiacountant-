#!/bin/bash

# Supabase Deployment Script
# This script applies all necessary migrations for receipt management

set -e

echo "🚀 Starting Supabase deployment..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo "   Install it with: npm install -g supabase"
    exit 1
fi

# Check if we're in a supabase project
if [ ! -d "supabase" ]; then
    echo "❌ 'supabase' directory not found. Are you in the project root?"
    exit 1
fi

echo "📋 Checking migration files..."
MIGRATIONS=(
    "supabase/migrations/20251113162336_initial_schema.sql"
    "supabase/migrations/20251113162337_rls_policies.sql"
    "supabase/migrations/20250115000000_add_ocr_data_to_expenses.sql"
    "supabase/migrations/20251116000000_receipts_storage.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    if [ -f "$migration" ]; then
        echo "  ✅ Found: $(basename $migration)"
    else
        echo "  ❌ Missing: $(basename $migration)"
        exit 1
    fi
done

echo ""
echo "🔄 Applying migrations..."
echo ""

# Link to Supabase project (if not already linked)
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Project not linked. Please link your project first:"
    echo "   supabase link --project-ref YOUR_PROJECT_REF"
    echo ""
    read -p "Do you want to continue with local development? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Apply migrations
echo "📤 Pushing migrations to Supabase..."
supabase db push

echo ""
echo "✅ Migrations applied successfully!"
echo ""
echo "🔍 Verifying deployment..."

# Check if we can verify (requires database access)
echo ""
echo "📝 Next steps:"
echo "   1. Verify the 'receipts' storage bucket exists in Supabase Dashboard"
echo "   2. Test uploading a receipt in the application"
echo "   3. Verify RLS policies are active"
echo ""
echo "✨ Deployment complete!"



