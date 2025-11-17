#!/bin/bash

# Setup script for OCR.space API key
# Run this script to add your OCR.space API key to .env

echo "🔧 Setting up OCR.space API key..."

# Create or update .env file
if [ -f .env ]; then
    # Check if OCR key already exists
    if grep -q "VITE_OCR_SPACE_API_KEY" .env; then
        # Update existing key
        sed -i.bak 's/VITE_OCR_SPACE_API_KEY=.*/VITE_OCR_SPACE_API_KEY=K89065624988957/' .env
        echo "✅ Updated VITE_OCR_SPACE_API_KEY in .env"
    else
        # Add new key
        echo "" >> .env
        echo "# OCR.space API Key for receipt scanning" >> .env
        echo "VITE_OCR_SPACE_API_KEY=K89065624988957" >> .env
        echo "✅ Added VITE_OCR_SPACE_API_KEY to .env"
    fi
else
    echo "⚠️  .env file not found. Please create it with your Supabase keys first."
    echo "Then add this line:"
    echo "VITE_OCR_SPACE_API_KEY=K89065624988957"
    exit 1
fi

echo ""
echo "🎉 OCR setup complete!"
echo ""
echo "Next steps:"
echo "1. Restart your dev server: npm run dev"
echo "2. Test receipt scanning in the app"




