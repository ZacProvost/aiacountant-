# Apply Migrations with psql

## Quick Method (Interactive Script)

Run the interactive script:
```bash
./apply-psql-now.sh
```

It will prompt you for:
- Your Supabase project reference (found in your Supabase dashboard)
- Database name (usually "postgres")
- Port (usually 5432)

## Manual Method

### Step 1: Get Your Connection String

1. Go to https://app.supabase.com
2. Select your project
3. Go to **Settings** → **Database**
4. Under **Connection string**, copy the **URI** format
5. Replace `[YOUR-PASSWORD]` with: `Zacprovost87@`

The connection string should look like:
```
postgresql://postgres:Zacprovost87@@db.xxxxx.supabase.co:5432/postgres
```

### Step 2: Apply Migrations

Run this command (replace with your actual connection string):

```bash
psql "postgresql://postgres:Zacprovost87@@db.xxxxx.supabase.co:5432/postgres" -f apply-migrations.sql
```

### Step 3: Verify

Run the verification script:
```bash
psql "postgresql://postgres:Zacprovost87@@db.xxxxx.supabase.co:5432/postgres" -f verify-supabase-setup.sql
```

## Alternative: Using Environment Variable

You can also set the connection string as an environment variable:

```bash
export PGDATABASE_URL="postgresql://postgres:Zacprovost87@@db.xxxxx.supabase.co:5432/postgres"
psql "$PGDATABASE_URL" -f apply-migrations.sql
```

## What Gets Applied

✅ Storage bucket `receipts` (private, 5MB limit)
✅ `expenses.receipt_path` column
✅ `expenses.ocr_data` column (JSONB)
✅ 4 RLS policies for secure receipt access
✅ Indexes for performance
✅ Helper function `get_receipt_url()`

## Troubleshooting

### Error: "psql: command not found"
Install PostgreSQL client:
```bash
brew install postgresql  # macOS
# or
sudo apt-get install postgresql-client  # Linux
```

### Error: "password authentication failed"
- Double-check the password: `Zacprovost87@`
- Make sure you're using the correct project reference
- Verify the connection string format

### Error: "relation does not exist"
Some tables might not exist yet. The migration uses `IF NOT EXISTS` clauses, so it's safe to run even if some parts already exist.



