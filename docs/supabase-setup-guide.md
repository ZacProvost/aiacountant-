# Supabase Setup Guide

Follow these steps to deploy the refactored AI stack to your Supabase project.

1. **Apply database migrations**
   ```bash
   supabase db push --file supabase/schema.sql
   ```
   This creates/updates core tables (`jobs`, `expenses`, etc.), AI metrics tables (`ai_metrics`, `ai_alerts`), triggers, and associated views.

2. **Review RLS policies**
   ```bash
   supabase db push --file supabase/policies.sql
   ```
   Ensure policies are active for authenticated users. Metrics tables intentionally remain without RLS (service role only).

3. **Configure environment variables (Edge Functions)**
   ```
   SUPABASE_URL=<project-url>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   SUPABASE_DB_URL=<postgres-connection-string>
   LM_STUDIO_URL=http://192.168.0.103:1234 (optional, defaults to this)
   USE_LM_STUDIO=true (optional, defaults to true)
   OPENROUTER_API_KEY=<openrouter-token> (optional, only if using OpenRouter)
   AI_PROXY_ALLOWED_ORIGINS=<optional csv of origins>
   AI_PROXY_MODEL=google/gemma-3-12b (optional override, defaults to this for LM Studio)
   AI_DB_POOL_SIZE=4 (optional)
   ```
   - `SUPABASE_DB_URL` is required for transactional access via the Postgres pool.
   - **Note**: If using LM Studio with a local IP, ensure your Edge Functions can reach it (may require VPN/tunnel for cloud deployments).

4. **Deploy Edge Functions**
   ```bash
   supabase functions deploy ai-proxy
   supabase functions deploy ai-actions
   supabase functions deploy financial-sync
   ```

5. **Redeploy any dependent functions (optional)**
   - If other functions rely on shared helpers (`_shared/`), redeploy them to pick up the new modules.

6. **Run automated tests locally (optional but recommended)**
   ```bash
   npm install
   npm run test:unit
   npm run test:deno
   ```
   Both suites must pass before promoting the changes.

7. **Verify observability**
   - Query `ai_metrics` to confirm entries are recorded.
   - Check `ai_alerts` for any recent warnings/critical events.
   - Tail function logs to ensure structured JSON output (contains `correlationId`).

8. **Smoke test**
   - Sign in to the app, initiate a chat, issue a command (e.g., “Crée un contrat de 5000$”) and confirm:
     - The AI responds with natural language.
     - Actions execute successfully (`jobs` table updated).
     - Metrics row inserted for both proxy and action functions.

9. **Done**
   - The production environment now serves the hardened AI workflow with transactional guarantees, monitoring, and automated validation.

