---
name: Expo/mobile merge breaks asset-verify shadcn typecheck
description: Why asset-verify typecheck suddenly fails in shadcn UI files after the mobile artifact merge
---

After the Expo `mobile` artifact merged, `pnpm --filter @workspace/asset-verify
run typecheck` started failing inside shadcn UI components (e.g.
`components/ui/calendar.tsx`, `components/ui/button-group.tsx`) with errors like
"Two different types with this name exist, but they are unrelated" and SlotProps
/ Ref mismatches.

**Cause:** the Expo app pulls its own `@types/react` version, so the monorepo now
resolves duplicate React type packages; shadcn/react-day-picker + React 19 types
clash across the two copies. These are NOT caused by feature edits in
`pages/*` and the app still RUNS (Vite/esbuild strips types).

**How to apply:** when you see these errors, do not chase them inside feature
files — verify your own changed files are clean (grep typecheck output excluding
the shadcn UI files). A real fix is a workspace-level single `@types/react`
(pin/override or dedupe), which is a separate infra task, not part of feature
work. Flag it to the user rather than silently expanding scope.
