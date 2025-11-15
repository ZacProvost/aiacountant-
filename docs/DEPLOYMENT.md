# Deployment Guide

This guide covers deploying Fiscalia to production.

## Prerequisites

- Supabase project created
- Supabase CLI installed and authenticated
- Frontend hosting account (Vercel, Netlify, etc.)
- (Optional) LM Studio or OpenRouter API key

## Step 1: Database Setup

1. **Apply database schema**
   ```bash
   supabase db push --file supabase/schema.sql
   ```

2. **Apply RLS policies**
   ```bash
   supabase db push --file supabase/policies.sql
   ```

3. **Verify tables created**
   ```bash
   supabase db inspect
   ```

## Step 2: Edge Functions Configuration

1. **Set required environment variables**
   ```bash
   supabase secrets set SUPABASE_URL="https://your-project.supabase.co"
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   supabase secrets set SUPABASE_DB_URL="postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
   ```

2. **Set optional AI configuration**
   ```bash
   # For LM Studio (local)
   supabase secrets set LM_STUDIO_URL="http://your-lm-studio-url:1234"
   supabase secrets set USE_LM_STUDIO="true"
   supabase secrets set AI_PROXY_MODEL="google/gemma-3-12b"
   
   # OR for OpenRouter (cloud)
   supabase secrets set OPENROUTER_API_KEY="sk-or-v1-your-key"
   supabase secrets set USE_LM_STUDIO="false"
   ```

3. **Verify secrets**
   ```bash
   supabase secrets list
   ```

## Step 3: Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy ai-proxy
supabase functions deploy ai-actions
supabase functions deploy financial-sync
supabase functions deploy conversation-memory

# Verify deployment
supabase functions list
```

## Step 4: Frontend Deployment

### Option A: Vercel

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Configure environment variables** in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_EDGE_FUNCTION_URL`

4. **Redeploy** after setting environment variables

### Option B: Netlify

1. **Install Netlify CLI**
   ```bash
   npm i -g netlify-cli
   ```

2. **Build and deploy**
   ```bash
   npm run build
   netlify deploy --prod --dir=dist
   ```

3. **Configure environment variables** in Netlify dashboard

### Option C: Manual

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Upload `dist/` folder** to your hosting provider

3. **Configure environment variables** in your hosting provider

## Step 5: Post-Deployment Verification

### Test Database Access

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';
```

### Test Edge Functions

```bash
# Check function logs
supabase functions logs ai-proxy --tail
supabase functions logs ai-actions --tail

# Test AI proxy endpoint
curl -X POST https://[project-ref].functions.supabase.co/ai-proxy \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Bonjour"}'
```

### Test Frontend

1. Open deployed frontend URL
2. Sign up / Sign in
3. Create a test job
4. Add an expense
5. Test AI chat interface

## Step 6: Configure CORS (if needed)

If your frontend domain differs from localhost, update CORS settings:

```bash
supabase secrets set AI_PROXY_ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
```

Then redeploy the `ai-proxy` function.

## Production Checklist

- [ ] Database schema applied
- [ ] RLS policies enabled
- [ ] Edge Functions deployed
- [ ] Environment variables configured
- [ ] Frontend deployed
- [ ] CORS configured (if needed)
- [ ] Authentication working
- [ ] AI chat functioning
- [ ] Data persistence verified
- [ ] Error monitoring set up

## Monitoring

### View Logs

```bash
# AI Proxy logs
supabase functions logs ai-proxy --tail

# AI Actions logs
supabase functions logs ai-actions --tail

# All functions
supabase functions logs --tail
```

### Monitor Metrics

Query `ai_metrics` table in Supabase dashboard:

```sql
SELECT 
  function_name,
  COUNT(*) as request_count,
  AVG(response_time_ms) as avg_response_time,
  COUNT(*) FILTER (WHERE success = true) / COUNT(*)::float * 100 as success_rate
FROM ai_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name;
```

### Monitor Alerts

```sql
SELECT * FROM ai_alerts
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## Troubleshooting

### Edge Functions Not Working

1. Check secrets are set: `supabase secrets list`
2. Check function logs: `supabase functions logs [function-name]`
3. Verify database connection in `SUPABASE_DB_URL`
4. Test locally: `supabase functions serve [function-name]`

### AI Not Responding

1. Verify LM Studio is running (if using local)
2. Check `LM_STUDIO_URL` is accessible from Supabase
3. Verify OpenRouter API key is valid (if using cloud)
4. Check AI proxy logs for errors

### Frontend Build Errors

1. Verify all environment variables are set
2. Check build logs for missing dependencies
3. Ensure Node.js version matches `.nvmrc` (if present)

### Database Connection Issues

1. Verify `SUPABASE_DB_URL` uses connection pooler (port 6543)
2. Check database password is correct
3. Verify network connectivity from Edge Functions

## Rollback Procedure

### Rollback Edge Functions

```bash
# Deploy previous version
supabase functions deploy [function-name] --version [previous-version]
```

### Rollback Database

```bash
# Revert migrations
supabase migration revert
```

### Rollback Frontend

Redeploy previous version from your hosting provider's deployment history.

## Security Best Practices

1. ✅ Never commit `.env` files
2. ✅ Use service role key only in Edge Functions
3. ✅ Enable RLS on all tables
4. ✅ Validate all user input
5. ✅ Use HTTPS in production
6. ✅ Regularly update dependencies
7. ✅ Monitor error logs for security issues
8. ✅ Rotate API keys periodically

## Performance Optimization

1. Enable Supabase database connection pooling
2. Use CDN for frontend static assets
3. Implement caching where appropriate
4. Monitor and optimize slow database queries
5. Use database indexes for frequently queried columns

