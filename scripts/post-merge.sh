#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Pre-apply schema objects that `drizzle-kit push` cannot create
# non-interactively. Adding a UNIQUE constraint to a table that already has
# rows triggers an interactive "truncate?" prompt; the post-merge environment
# closes stdin, so that prompt would abort the migration (and --force does not
# bypass it). This guarded DDL is idempotent and safe to run on every merge.
# Everything else (new tables, nullable columns) is additive and is handled by
# the plain `push` below, which fails loudly rather than performing any
# destructive change.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_account_id_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_account_id_unique UNIQUE (account_id);
  END IF;
END $$;
SQL

pnpm --filter @workspace/db run push < /dev/null
