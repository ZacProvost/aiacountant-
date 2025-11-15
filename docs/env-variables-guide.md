# Environment Variables Setup Guide

This guide shows you exactly where to find each environment variable needed for your Supabase Edge Functions.

## Required Environment Variables

You need to set these 3 required environment variables in your Supabase project:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `SUPABASE_DB_URL`

**Note:** `OPENROUTER_API_KEY` is now **optional** - only needed if you want to use OpenRouter as a fallback or disable LM Studio.

---

## Where to Find Each Variable

### 1. SUPABASE_URL

**Location:** Supabase Dashboard → Project Settings → API

**Steps:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (gear icon) in the left sidebar
4. Click **API** under Project Settings
5. Find **Project URL** in the "Project API keys" section
6. Copy the URL (it looks like: `https://xxxxxxxxxxxxx.supabase.co`)

**Example:**
```
https://eihqjpdpuavfioqijjlc.supabase.co
```

---

### 2. SUPABASE_SERVICE_ROLE_KEY

**Location:** Supabase Dashboard → Project Settings → API

**Steps:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (gear icon) in the left sidebar
4. Click **API** under Project Settings
5. Find **service_role** key in the "Project API keys" section
6. Click the **eye icon** to reveal it, then click **Copy**
7. ⚠️ **WARNING:** This key has full access to your database. Keep it secret!

**Example:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpaHFqcGRwdWF2ZmlvcWlqamxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5ODk2NzIwMCwiZXhwIjoyMDE0NTQzMjAwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 3. SUPABASE_DB_URL

**Location:** Supabase Dashboard → Project Settings → Database

**⚠️ IMPORTANT:** For Edge Functions, you MUST use the **Connection Pooler** URL (port 6543), NOT the direct connection (port 5432).

**Steps:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (gear icon) in the left sidebar
4. Click **Database** under Project Settings
5. Scroll down to **Connection string** section
6. **Select "Connection pooling" tab** (NOT "URI" tab)
7. Select **Transaction mode** or **Session mode**
8. Copy the connection string (it includes your password)
9. The format should be: `postgresql://postgres.xxxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

**Example (Connection Pooler - CORRECT):**
```
postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**❌ WRONG (Direct Connection - Don't use this):**
```
postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
```

**Why?** Edge Functions work better with the connection pooler because:
- Better connection management
- Handles SSL/TLS properly
- Avoids "Unknown response for startup" errors
- More reliable for serverless functions

**Note:** If you don't see your password, you may need to:
- Click **Reset database password** if you forgot it
- The pooler URL format is different from the direct connection URL

---

### 4. OPENROUTER_API_KEY (Optional)

**⚠️ This is now optional** - Only needed if you want to use OpenRouter instead of LM Studio.

**Location:** OpenRouter Dashboard

**Steps:**
1. Go to https://openrouter.ai/
2. Sign in or create an account
3. Click on your profile/account icon
4. Go to **Keys** section
5. Create a new API key or copy an existing one
6. Copy the key

**Example:**
```
sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**When to use:** Set this if you want to use OpenRouter instead of LM Studio, or as a fallback option.

---

## How to Set the Variables

Once you have all the values, set them using the Supabase CLI:

```bash
# Set SUPABASE_URL
supabase secrets set SUPABASE_URL="https://your-project-id.supabase.co"

# Set SUPABASE_SERVICE_ROLE_KEY
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"

# Set SUPABASE_DB_URL
supabase secrets set SUPABASE_DB_URL="postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres"

# Set OPENROUTER_API_KEY (optional - only if using OpenRouter)
supabase secrets set OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# Set LM Studio URL (optional - defaults to http://192.168.0.103:1234)
supabase secrets set LM_STUDIO_URL="http://192.168.0.103:1234"

# Set AI model (optional - defaults to google/gemma-3-12b for LM Studio)
supabase secrets set AI_PROXY_MODEL="google/gemma-3-12b"
```

## Verify Your Variables Are Set

Check that all variables are set:

```bash
supabase secrets list
```

You should see at least the 3 required variables listed (the values will be hidden for security).

---

## Optional Variables

These are optional but can be useful:

### LM_STUDIO_URL
- **Default:** `http://192.168.0.103:1234`
- **Purpose:** URL of your local LM Studio server
- **Set with:** `supabase secrets set LM_STUDIO_URL="http://your-ip:port"`
- **Note:** Make sure your LM Studio server is accessible from Supabase Edge Functions (may require VPN/tunnel for local IPs)

### USE_LM_STUDIO
- **Default:** `true` (LM Studio is used by default)
- **Purpose:** Enable/disable LM Studio (set to `false` to use OpenRouter instead)
- **Set with:** `supabase secrets set USE_LM_STUDIO="false"` to disable LM Studio

### AI_PROXY_MODEL
- **Default:** `google/gemma-3-12b` (when using LM Studio) or `nvidia/nemotron-nano-9b-v2:free` (when using OpenRouter)
- **Purpose:** Override the AI model used by the proxy
- **Set with:** `supabase secrets set AI_PROXY_MODEL="model-name"`
- **Note:** For LM Studio, use the exact model name as it appears in LM Studio (e.g., `google/gemma-3-12b`)

### AI_PROXY_ALLOWED_ORIGINS
- **Default:** Localhost ports (3000, 5173, 5174)
- **Purpose:** Add additional allowed CORS origins (comma-separated)
- **Set with:** `supabase secrets set AI_PROXY_ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"`

### AI_DB_POOL_SIZE
- **Default:** `4`
- **Purpose:** Number of database connections in the pool
- **Set with:** `supabase secrets set AI_DB_POOL_SIZE="8"`

---

## Troubleshooting

### If you can't find SUPABASE_DB_URL:
- Make sure you're looking in **Database** settings, not API settings
- The connection string might be in the "Connection pooling" section
- You may need to reset your database password if you don't know it

### If LM Studio connection fails:
- **Network Accessibility:** Supabase Edge Functions run in the cloud and may not be able to reach local IP addresses (like `192.168.0.103`)
  - **Solution:** Use a tunnel service (ngrok, Cloudflare Tunnel, Tailscale) to expose your LM Studio server
  - Or deploy Edge Functions locally for development
  - Or use a public IP/domain pointing to your Windows machine
- Verify LM Studio is running and the server is started
- Check that the model `google/gemma-3-12b` is loaded in LM Studio
- Verify the port (default: 1234) is correct
- Check Windows firewall allows connections on port 1234
- Test the endpoint manually: `curl http://192.168.0.103:1234/v1/models`

### If OPENROUTER_API_KEY doesn't work (when using OpenRouter):
- Make sure you have credits/balance in your OpenRouter account
- Check that the key has the right permissions
- Verify the key is active in your OpenRouter dashboard

### If variables aren't being picked up:
- Make sure you're setting them in the correct Supabase project
- Redeploy your functions after setting variables: `supabase functions deploy ai-proxy ai-actions`
- Check function logs: `supabase functions logs ai-proxy`

