---
name: Universe Control Space scope
description: What the Universe Control Space page must and must NOT contain (recurring user correction).
---

# Universe Control Space (universe-control-space.tsx) scope

The "Universe Control Space" page must contain ONLY two things:
1. **System Accounts** — the genesis/system core accounts (000000000000 … 999999999999)
   with live balances, read from `GET /api/matrix/accounts` filtered to the SYSTEM_CORES list.
2. **Universe Vault** — gravity mint (`POST /api/matrix/mint`, founder/admin gated),
   asset submit (`useSubmitAsset` → `POST /api/assets`), and the gravity split into the
   decided ratios/accounts (1% founder / 24% reserve / 25% stability / 25% security /
   25% growth→target). Show the split policy.

It must NOT contain the admin "Asset Registry" dashboard (approve / reject / Deposit & Mint,
client name/email, admin stats). That admin surface lives ONLY in admin.tsx ("Admin Control Room").

**Why:** the user corrected this more than once — they want admin user-handling separated from
the universe minting surface. Re-adding the admin registry to this page is a regression.

**How to apply:** when editing universe-control-space.tsx, keep it to System Accounts + Universe
Vault. Reuse the exact mint logic from matrix.tsx and the submit form from submit.tsx; never
change the matrixEngine split ratios.
