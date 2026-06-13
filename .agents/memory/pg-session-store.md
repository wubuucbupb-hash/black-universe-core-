---
name: api-server sessions are Postgres-backed (connect-pg-simple must be esbuild-external)
description: Why the api-server uses a PG session store and the esbuild gotcha that makes it silently fail.
---

The api-server uses **connect-pg-simple** (Postgres-backed express-session),
reusing `@workspace/db`'s exported `pool`. `app.set("trust proxy", 1)` is set so
secure cookies work behind the Replit proxy in production.

**Why PG store:** the default in-memory store loses every session on each
api-server restart (dev rebuilds + deploys), which logs everyone out. Symptom was
an intermittent 401 "Unauthorized" on admin-only routes (e.g. /api/matrix/mint)
right after a restart, even though login still returned 200.

**esbuild gotcha (critical):** connect-pg-simple reads its `table.sql` via a path
relative to its own file. When esbuild bundles it into `dist/index.mjs`, that path
resolves to `dist/table.sql` -> ENOENT -> the session table is never created ->
sessions silently don't persist -> login 200 but the very next request is 401.
Fix: it MUST be in the `external` list in `artifacts/api-server/build.mjs` (same
reason bcrypt/pg-native are external). Any other dep that reads sibling data files
(.sql/.proto/etc.) needs the same treatment.

**How to apply:** if login works but authenticated requests 401, check that
the `session` table exists in Postgres and that the package is externalized in
build.mjs — don't assume the auth/session code is wrong.
