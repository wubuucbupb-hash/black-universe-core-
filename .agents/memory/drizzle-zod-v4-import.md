---
name: drizzle-zod must import zod/v4
description: Why every drizzle-zod schema file must import z from "zod/v4", and how a plain "zod" import silently breaks dependent packages.
---

# drizzle-zod schema files must import `z` from `zod/v4`

Any `lib/db` schema file that calls `createInsertSchema` (drizzle-zod) and then does `z.infer<...>` MUST `import { z } from "zod/v4"`, never `import { z } from "zod"`.

**Why:** drizzle-zod's `createInsertSchema` returns a `zod/v4`-typed schema. If the same file's `z` comes from plain `"zod"`, `z.infer` rejects it with `TS2344: ... does not satisfy the constraint 'ZodType<...>'`. That error is in a **composite lib**, so `tsc --build` aborts declaration emit for `@workspace/db`. Dependent leaf packages (e.g. `api-server`) then fail with misleading `TS2305: Module '@workspace/db' has no exported member 'matrixAccountsTable'` and `TS2339: Property '...' does not exist` — the real cause is the upstream lib build, not the imports in those files.

**How to apply:** When you see `@workspace/db` "has no exported member" / missing-property errors in a leaf package, run `pnpm run typecheck:libs` first. If it fails inside a schema file, check the zod import line — align it to `zod/v4` (see `lib/db/src/schema/assets.ts` as the correct reference). Rebuild libs, then re-run the leaf typecheck.
