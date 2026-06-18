---
name: Custody Vault visibility is role-scoped
description: On the /vault page external users must see ONLY their own custody entries + own totals; admin sees system-wide.
---

The `/vault` (Custody Vault) page is role-scoped for **visibility**:

- **External (non-admin) users** → `GET /api/custody/mine`: returns ONLY the
  caller's own custody entries (ownerAccount OR escrowFrom/ToAccount = their
  matrix accountNumber, looked up via usersTable by session userId), decrypted,
  plus a summary (counts + totalLockedValue) scoped to just those entries.
- **Admin/founder** → `GET /api/custody/vault` (full decrypted ledger, founder-only)
  + `GET /api/custody/summary` (system-wide counts/value).

**Why:** `/custody/summary` is system-wide and was previously fetched by EVERY
logged-in user on the vault page, leaking system-wide `totalLockedValue` to
external users. The fix routes non-admins to `/custody/mine` instead.

**How to apply:**
- On vault.tsx, `/custody/summary` and `/custody/vault` queries must be
  `enabled: !!isAdmin`; non-admins use `/custody/mine`. Never re-enable
  `/custody/summary` for non-admins on this page or the leak returns.
- Row action buttons (revalue/release) stay `{isAdmin && ...}` — external users
  view their entries read-only.
- Out of scope (left as-is): the public Home `/` showcase still uses
  `/custody/summary` (system-wide, session-gated), and the escrow/lock forms'
  account dropdowns. The request was visibility-only.
