---
name: api-server has no tsx (run one-off scripts via esbuild)
description: How to execute a one-off TS script that imports @workspace/db / engine code in the api-server package, since tsx is not installed.
---

The `@workspace/api-server` package has **no `tsx`** and no ts-node. Its `dev`
script is `esbuild build -> node dist/index.mjs` (see `build.mjs`). So
`pnpm --filter @workspace/api-server exec tsx <file>` fails with
`Command "tsx" not found`.

Also note: `python3` is **not** available in the shell.

**Why:** Lib packages (`@workspace/db`, engine code) are composite/emitDeclarationOnly
— they have `.d.ts` but no runtime `.js`. They only become runnable when esbuild
bundles their source into the api-server bundle. So a one-off script that imports
`@workspace/db` cannot just be `node`-run or `tsx`-run; it must be esbuild-bundled.

**How to apply:** To run a throwaway script that exercises the real engine against
the DB (e.g. verify `mintGravity` balances):
1. Write `artifacts/api-server/src/__x.ts` importing from `./lib/...` and
   `@workspace/db`.
2. Write a tiny esbuild build script (mirror `build.mjs`): `platform:"node"`,
   `bundle:true`, `format:"esm"`, externalize native deps
   (`["*.node","bcrypt","pg-native","re2","farmhash"]`), and add the
   `createRequire` banner so bundled CJS deps work.
3. `node build.mjs && node dist/__x.mjs` — DATABASE_URL is already in env.
4. Delete the temp .ts, the build script, and `dist/__x.mjs(.map)` afterward.
