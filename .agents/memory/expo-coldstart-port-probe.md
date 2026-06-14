---
name: Expo cold-start port probe (DIDNT_OPEN_A_PORT)
description: Why the expo artifact workflow can fail its port probe even though the app is fine, and how to verify instead.
---

The expo artifact workflow uses `ensurePreviewReachable = "/status"` against Metro's
port (e.g. 18115). On a cold start Metro logs "Web is waiting on http://localhost:PORT"
and serves HTTP 200, but it binds the web port **lazily on first request** and the
first bundle takes ~35s+. The workflow probe can time out and SIGKILL Metro before it
is reachable on the probe's path, reporting `DIDNT_OPEN_A_PORT`. Repeated restarts fail
identically — this is an environment cold-start quirk, not a code error.

**Why:** Metro's lazy port bind + slow first bundle vs. the workflow probe window.

**How to apply:**
- Don't loop `restart_workflow` many times expecting it to pass — each attempt blocks
  ~360s and fails the same way.
- Verify the app functionally instead: confirm typecheck passes and that Metro serves
  by curling `http://localhost:PORT/` (returns 200) — but note a bare `curl` of the
  port from bash can itself wake the lazy bind.
- You CANNOT keep Metro alive by backgrounding `pnpm exec expo start` from the bash
  tool: the tool kills the process group on exit (exit code 143), even with
  `nohup`/`setsid`/`disown`.
- The screenshot tool needs the workflow actually running, so it won't work while the
  probe keeps killing Metro.
- Treat code-level verification (typecheck + clean Metro start + HTTP 200) as
  sufficient when the probe is the only blocker, and tell the user a real
  device/Expo Go or a warm retry is the way to see the UI.
