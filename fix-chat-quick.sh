#!/bin/bash

echo "🔧 Fiscalia Chat Diagnostic & Quick Fix"
echo "========================================"
echo ""

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found"
    echo "   Install it: https://supabase.com/docs/guides/cli"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check current secrets
echo "📋 Checking configured secrets..."
supabase secrets list
echo ""

# Check if LM Studio or OpenRouter is configured
echo "🔍 Checking AI provider configuration..."
echo ""
echo "Choose your AI provider:"
echo ""
echo "1. LM Studio (Local) - Requires LM Studio running on your computer"
echo "2. OpenRouter (Cloud) - Easiest option, requires API key"
echo "3. Run functions locally (Development mode)"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "📍 LM Studio Setup"
        echo ""
        echo "⚠️  WARNING: Edge Functions run in the cloud and can't reach"
        echo "   local IP addresses like 192.168.0.103"
        echo ""
        echo "You need to expose LM Studio using ngrok:"
        echo "1. Download ngrok: https://ngrok.com/download"
        echo "2. Run: ngrok http 1234"
        echo "3. Copy the HTTPS URL (e.g., https://abc123.ngrok.io)"
        echo ""
        read -p "Enter your ngrok URL: " ngrok_url
        
        if [ -z "$ngrok_url" ]; then
            echo "❌ No URL provided"
            exit 1
        fi
        
        echo ""
        echo "Setting LM_STUDIO_URL to $ngrok_url..."
        supabase secrets set LM_STUDIO_URL="$ngrok_url"
        supabase secrets set USE_LM_STUDIO="true"
        
        echo ""
        echo "Redeploying ai-proxy function..."
        supabase functions deploy ai-proxy
        
        echo ""
        echo "✅ LM Studio configured!"
        echo "   Make sure LM Studio is running with a model loaded"
        ;;
        
    2)
        echo ""
        echo "🌐 OpenRouter Setup"
        echo ""
        echo "Get your free API key:"
        echo "1. Visit: https://openrouter.ai/"
        echo "2. Sign up / log in"
        echo "3. Go to Keys section"
        echo "4. Copy your API key"
        echo ""
        read -p "Enter your OpenRouter API key: " api_key
        
        if [ -z "$api_key" ]; then
            echo "❌ No API key provided"
            exit 1
        fi
        
        echo ""
        echo "Setting OpenRouter configuration..."
        supabase secrets set OPENROUTER_API_KEY="$api_key"
        supabase secrets set USE_LM_STUDIO="false"
        
        echo ""
        echo "Redeploying ai-proxy function..."
        supabase functions deploy ai-proxy
        
        echo ""
        echo "✅ OpenRouter configured!"
        ;;
        
    3)
        echo ""
        echo "🏠 Local Development Setup"
        echo ""
        echo "This will run Edge Functions locally so they can reach LM Studio."
        echo ""
        echo "1. Make sure LM Studio is running at http://localhost:1234"
        echo "2. Run in a new terminal: supabase functions serve"
        echo "3. Update your .env with:"
        echo "   VITE_SUPABASE_EDGE_FUNCTION_URL=http://127.0.0.1:54321/functions/v1"
        echo "4. Restart your dev server: npm run dev"
        echo ""
        echo "Press Enter to continue..."
        read
        ;;
        
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Configuration complete!"
echo ""
echo "Next steps:"
echo "1. Wait 30 seconds for functions to redeploy"
echo "2. Refresh your app in the browser"
echo "3. Try sending a message in the chat"
echo ""
echo "If it still doesn't work, check: diagnose-chat.md"




