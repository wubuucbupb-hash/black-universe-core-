---
name: DB schema drift on task merge
description: Task commits change lib/db/src/schema/users.ts (adding columns like phone_number, sub_category, etc.) but never run the migration push, causing runtime query failures.
---

# DB schema drift after task merges

## The rule
After any task merge that touches `lib/db/src/schema/`, always run:
```
pnpm --filter @workspace/db run push
```

**Why:** Task commits added columns (phone_number, sub_category, document_url, account_number, biometric_key) to the users table schema but the push never ran. Any query that references those columns fails at runtime with a Drizzle "Failed query" error.

**How to apply:** When a login or DB query fails with "Failed query" and the error references a column like `phone_number`, run the push command immediately before anything else.

## Current users table extra columns (added by task)
- `phone_number` (text, nullable)
- `sub_category` (text, nullable)
- `document_url` (text, nullable)
- `account_number` (text, nullable)
- `biometric_key` (text, nullable)

## Note on schema nullable changes
The task also made `name`, `email`, `password_hash`, `role`, and `created_at` nullable (removed `.notNull()`). The login and register routes must handle nullable `passwordHash` gracefully.

## `drizzle-kit push` is destructive here — prefer raw ALTER for additive columns
`pnpm --filter @workspace/db run push` wants to DROP the `session` table (created at runtime by `connect-pg-simple`, not part of the Drizzle schema). Accepting that drop logs everyone out.

**Why:** The session store table is not declared in `lib/db/src/schema`, so drizzle-kit sees it as drift and proposes dropping it. Interactive push also stalls on the prompt.

**How to apply:** For purely additive changes (new nullable columns), still edit the Drizzle schema (so the ORM types are correct), but apply to the DB with raw SQL: `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>`. Do NOT run a blind `push` that would drop `session`. Reserve push for cases where you can review and reject the session-table drop.
