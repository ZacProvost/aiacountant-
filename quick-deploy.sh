#!/bin/bash

# Quick Supabase Deployment Script
# This will apply all migrations to your Supabase project

set -e

cd "$(dirname "$0")"

echo "🚀 Supabase Migration Deployment"
echo "================================"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Project not linked to Supabase."
    echo ""
    echo "Please link your project first:"
    echo "  1. Get your project reference from: https://app.supabase.com"
    echo "  2. Run: supabase link --project-ref YOUR_PROJECT_REF"
    echo ""
    read -p "Do you want to link now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your Supabase project reference: " PROJECT_REF
        supabase link --project-ref "$PROJECT_REF"
    else
        echo "Exiting. Please link your project and run this script again."
        exit 1
    fi
fi

echo "📋 Migration files to apply:"
ls -1 supabase/migrations/*.sql | xargs -n1 basename
echo ""

read -p "Apply these migrations to your Supabase project? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "📤 Applying migrations..."
echo ""

# Apply migrations
supabase db push

echo ""
echo "✅ Migrations applied successfully!"
echo ""
echo "🔍 Verifying setup..."
echo ""
echo "Run the verification script in Supabase SQL Editor:"
echo "   File: verify-supabase-setup.sql"
echo ""
echo "Or check manually:"
echo "   1. Storage → Verify 'receipts' bucket exists"
echo "   2. Table Editor → expenses → Verify columns: receipt_path, ocr_data"
echo "   3. Authentication → Policies → Verify 4 receipt policies"
echo ""
echo "✨ Done!"



