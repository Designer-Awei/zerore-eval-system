# Supabase Setup

This project is linked to Supabase project ref `rukjxsykowetriaxifon`.

Do not commit Supabase secrets. The publishable key is safe for browser clients, but it is not a database password and it is not enough for the server-side `pg` adapter.

## CLI Setup

Install and login to the Supabase CLI:

```bash
brew install supabase/tap/supabase
supabase login
```

Link the project:

```bash
npm run db:supabase:link
```

Push migrations:

```bash
npm run db:supabase:push
```

## Environment

Use local JSON while developing without Supabase:

```bash
ZERORE_DATABASE_ADAPTER=local-json
```

Use Supabase/Postgres for server-side projection writes:

```bash
ZERORE_DATABASE_ADAPTER=postgres
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@db.rukjxsykowetriaxifon.supabase.co:5432/postgres
ZERORE_POSTGRES_SSL=require
```

If Supabase direct connections are not available from your network, use the pooler connection string from Supabase Dashboard -> Project Settings -> Database.

## Verification

After setting `DATABASE_URL`, run:

```bash
npm run db:smoke
npm run db:smoke:evaluate-projection
```

The first smoke writes one generic record through the active `ZeroreDatabase` adapter and reads it back. The second smoke runs the evaluate pipeline on a fixture CSV, persists the quality-signal projection and verifies the run can be read back.
