---
name: Task-commit clobbers index.ts
description: Large background task merges have replaced artifacts/api-server/src/index.ts with a bare Express app, losing pino logging, express-session, the organized route modules, ensureAdmin(), and the health endpoint.
---

# Task-commit overwrites server entry point

## The rule
After any large task merge, immediately verify `artifacts/api-server/src/index.ts` still imports from `./app` and calls `ensureAdmin()`. If it instead contains inline `app.use(...)` calls and `console.log`, the task clobbered it.

**Why:** Task agents rewrote index.ts to a flat Express app with hardcoded routes, removing express-session (breaks all auth), pino (breaks structured logging), the health route (breaks deployment probe), and ensureAdmin() (breaks admin credentials on restart).

**How to apply:** On any deployment failure or 404 on /api/healthz, read index.ts first. The correct version starts with `import app from "./app"` and calls `ensureAdmin().then(() => app.listen(...))`. If it instead starts with `import express from "express"` and has inline routes, restore it immediately.

## Canonical correct index.ts structure
```typescript
import app from "./app";
import { logger } from "./lib/logger";
import { ensureAdmin } from "./lib/ensureAdmin";

const rawPort = process.env["PORT"];
// ... port validation ...

ensureAdmin()
  .then(() => { app.listen(port, ...) })
  .catch((err) => { logger.error(...); process.exit(1); });
```

## Signs the file was clobbered
- Log output shows `Server listening port: 8080` (plain text) instead of pino JSON/pretty format
- `GET /api/healthz` returns 404
- Login returns 404 or "Cannot POST /api/users/login"
- `users.ts` only has reset-password route (missing login, register, /me, logout)
