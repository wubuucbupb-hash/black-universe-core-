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
