---
name: Vault backing is coupled to lock/deposit/revalue/release; mint only draws
description: The economic model where value flows INTO VAULT_ACCOUNT first (lock/deposit/revalue/release move backing) and mint only draws against it via the 200% gate.
---

# Value flows INTO the Vault first; mint only draws against backing

The model is backing-coupled (it used to be registry-only — that is obsolete):

- **Lock** (`POST /api/custody/lock`): inserts a LOCKED custody entry AND bumps `VAULT_ACCOUNT` backing by `valuation / GRAVITY_RATE`, atomically in one tx. Logs `VAULT_LOCK`.
- **Revalue** (`POST /api/custody/revalue/:id`, founder-only): locks the row FOR UPDATE, moves `VAULT_ACCOUNT` by the **delta** `(newVal - oldVal)/GRAVITY_RATE`. Rejects escrow entries (`IS_ESCROW`) and non-`LOCKED` status. Logs `VAULT_REVALUE`.
- **Release** (`POST /api/custody/release/:id`): for a **plain** (non-escrow) asset, pulls its value back OUT of backing (`-valuation/GRAVITY_RATE`), the mirror of lock. Logs `VAULT_RELEASE`. Escrow releases keep their original receiver-credit + 1% founder fee path untouched.
- **Deposit** (`POST /admin/assets/:id/deposit`): already bumped `VAULT_ACCOUNT` backing — unchanged.
- **Mint** (`POST /api/matrix/mint`): pure DRAW. It does NOT auto-lock or inject backing. It issues Gravity against pre-existing backing, gated at 200% (`VAULT >= VAULT_BACKING_RATIO * coreGravity`).

**Why:** the user's final mental model is "value must enter the Vault BEFORE you can mint against it." Earlier an attempt had mint auto-lock/inject its own backing — that was circular (mint against X while X also backs the mint) and was reverted. Keeping mint a pure draw and making lock/deposit/revalue/release the only backing movers keeps the collateral ratio honest.

**How to apply:**
- Never re-add a `VAULT_ACCOUNT` bump or custody auto-lock to the mint path.
- Any new path that takes an asset into/out of custody must move backing in lockstep (add on entry, remove on exit) inside the same transaction, or the 200% gate drifts.
- Frontend: the vault lock/deposit form (vault.tsx) mirrors the mint form's currency selector — pick 🌌 Gravity or any world currency; the typed amount is converted to canonical ₹ in `lockForm.valuation` (server divides by `GRAVITY_RATE`). Live FX via `fetchInrPerUnitRates` with `STATIC_INR_PER_UNIT` fallback.
