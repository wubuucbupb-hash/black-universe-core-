---
name: System Vault vs Users Vault — only System Vault backs minting
description: Custody lock/revalue/release move the Users Vault (visible but never backs mint); only admin approve/deposit move the System Vault; mint draws against the System Vault only, gated 200%.
---

# Two structurally separate vaults; only the System Vault backs minting

There are TWO "Vault"-type system accounts. Do NOT conflate them:

- **System Vault `000000000001`** (`VAULT_ACCOUNT`) — the ONLY pool that backs minting. Moved by admin **approve** (`POST /admin/assets/:id/approve`) and **deposit** (`POST /admin/assets/:id/deposit`), which add `claimedValue / GRAVITY_RATE` (G) as backing.
- **Users Vault `000000000002`** (`USERS_VAULT`) — holds user custody-lock value. Visible and counted in the "Total Vault" (System + Users) for DISPLAY only; it NEVER backs minting.

Custody routes (`artifacts/api-server/src/routes/custody.ts`) all move the **Users Vault**, atomically inside their tx:
- **Lock** (`POST /api/custody/lock`): inserts LOCKED entry AND bumps `USERS_VAULT` by `valuation / GRAVITY_RATE`. Logs `VAULT_LOCK`.
- **Revalue** (`POST /api/custody/revalue/:id`, founder-only): row FOR UPDATE, moves `USERS_VAULT` by the **delta** `(newVal - oldVal)/GRAVITY_RATE`. Rejects escrow + non-`LOCKED`. Logs `VAULT_REVALUE`.
- **Release** (`POST /api/custody/release/:id`): plain (non-escrow) asset pulls its value back OUT of `USERS_VAULT` (`-valuation/GRAVITY_RATE`). Escrow releases keep their receiver-credit + 1% founder fee path untouched.

- **Mint** (`POST /api/matrix/mint`): pure DRAW against the **System Vault** only, gated at 200% (`vaultGravity >= VAULT_BACKING_RATIO * coreGravity`, reading System Vault). It does NOT auto-lock or inject backing.

**Why (changed):** the model used to couple custody lock/revalue/release to the System Vault backing — so user custody locks inflated mint capacity. The user split them STRUCTURALLY: a user locking an asset must NOT increase how much the system can mint. Custody value still shows (Total Vault) but mint is gated on the System Vault alone.

**How to apply:**
- Custody lock/revalue/release → `USERS_VAULT`. Admin approve/deposit + mint draw → `VAULT_ACCOUNT` (System). Never cross-wire these.
- Never re-add a `VAULT_ACCOUNT` bump or custody auto-lock to the mint path, and never point custody routes back at `VAULT_ACCOUNT`.
- `getVaultStatus()` returns `vaultGravity` (System), `usersVaultGravity`, and `totalVaultGravity`; the mint gate reads `vaultGravity` only.
- `totalDistributedGravity()` excludes BOTH vault accounts + System Core.
- Frontend (`universe-control-space.tsx`): banner shows System Vault / Users Vault / Total Vault separately; both vaults are in `SYSTEM_CORES` and excluded from transfer/escrow dropdowns (matrix.tsx, vault.tsx, admin.tsx).
- The vault lock form (vault.tsx) mirrors the mint form's currency selector — pick 🌌 Gravity or any world currency; the typed amount is converted to canonical ₹ in `lockForm.valuation` (server divides by `GRAVITY_RATE`). Live FX via `fetchInrPerUnitRates` with `STATIC_INR_PER_UNIT` fallback.
