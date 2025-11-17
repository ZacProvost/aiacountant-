# Chat Not Working - Diagnostic Guide

## The Issue

You're seeing **"Failed to send a request to the Edge Function"** in the chat, which means the `ai-proxy` Edge Function isn't responding properly.

**This is NOT related to the receipt scanning** - it's the main AI chat functionality.

## Quick Diagnosis

### Step 1: Check Your LM Studio

The chat uses either **LM Studio** (local) or **OpenRouter** (cloud) for AI processing.

**Is LM Studio running?**
1. Open LM Studio on your computer
2. Make sure the server is started (green "Server Running" indicator)
3. Check that a model is loaded (e.g., `google/gemma-3-12b`)
4. Verify the server URL is `http://192.168.0.103:1234` (or your local IP)

### Step 2: Check Edge Function Configuration

Your Edge Functions are deployed, but they need to be configured with:
- `LM_STUDIO_URL` - URL to your LM Studio server
- Or `OPENROUTER_API_KEY` - If you want to use OpenRouter instead

Run this command to check secrets:
\`\`\`bash
supabase secrets list
\`\`\`

You should see at least:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- Either `LM_STUDIO_URL` or `OPENROUTER_API_KEY`

### Step 3: Network Connectivity

**Problem:** Your Edge Functions (running in Supabase cloud) can't reach your LM Studio (running locally).

**Why:** Local IP addresses like `192.168.0.103` aren't accessible from the internet.

**Solutions:**

#### Option A: Use OpenRouter (Easiest)
1. Get free credits at https://openrouter.ai/
2. Set the API key:
   \`\`\`bash
   supabase secrets set OPENROUTER_API_KEY="sk-or-v1-your-key"
   supabase secrets set USE_LM_STUDIO="false"
   supabase functions deploy ai-proxy
   \`\`\`

#### Option B: Expose LM Studio with Ngrok (For Testing)
1. Download ngrok: https://ngrok.com/download
2. Run: `ngrok http 1234`
3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
4. Set it:
   \`\`\`bash
   supabase secrets set LM_STUDIO_URL="https://abc123.ngrok.io"
   supabase functions deploy ai-proxy
   \`\`\`

#### Option C: Run Functions Locally (Development)
\`\`\`bash
supabase functions serve
\`\`\`

Then update your `.env`:
\`\`\`
VITE_SUPABASE_EDGE_FUNCTION_URL=http://127.0.0.1:54321/functions/v1
\`\`\`

Restart your dev server.

## Quick Test

Try sending a simple message in the chat like "Bonjour"

If it works: ✅ You're all set!  
If not: Check the browser console (F12) for error details

## Common Errors

### "Network error" or "Fetch failed"
- LM Studio isn't running or not accessible
- Use OpenRouter or ngrok to fix

### "Model not loaded"
- LM Studio needs a model loaded
- Load a model in LM Studio UI

### "Rate limit exceeded"
- You hit OpenRouter's free tier limit
- Wait or add credits

## Still Not Working?

1. Check browser console (F12 → Console tab)
2. Look for red error messages
3. Share the error message for more specific help

## What About Receipt Scanning?

Receipt scanning works independently! It uses:
- Your OCR.space API key (already configured: `K89065624988957`)
- Or Tesseract.js (always works, client-side)

To use it:
1. Go to **Dépenses** (Expenses)
2. Click **Ajouter une dépense**
3. Click **Scanner un reçu**
4. Upload a receipt

This works even if the chat isn't working!

---

**Next Steps:**
1. Choose Option A (OpenRouter) for quickest fix
2. Or start LM Studio and use Option B (ngrok)
3. Test the chat again




