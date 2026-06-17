---
name: Vault vs System Core (200% backing)
description: How Gravity backing is split — BOTH Vault and System Core are counted in Gravity, with a gravity-vs-gravity 200% invariant. Display currency is a separate view-only layer.
---

# Vault vs System Core backing model

Two distinct system accounts, do not conflate them. **Both store GRAVITY** in `gravityBalance`:

- **System Core `000000000000`** (type "System Core") — holds the TOTAL minted Gravity as an odometer. On mint it does BOTH `core += gravity` AND distributes the gravity to pools, so core always equals the sum of all distributed gravity.
- **Reserve Vault `000000000001`** (type "Vault") — holds GRAVITY that backs the system. `gravityBalance` = gravity (NOT ₹). Prefix `0` keeps it out of citizen clusters (safe).

**Why (changed):** Vault used to store ₹ in `gravityBalance`. Now everything backend-side is gravity-vs-gravity. Do NOT revert Vault to ₹ or re-introduce `× GRAVITY_RATE` into the invariant.

## Invariant (enforced in `mintGravity`)
`vaultGravity ≥ VAULT_BACKING_RATIO × coreGravity` where `VAULT_BACKING_RATIO = 2` (200%). Pure gravity-vs-gravity, no GRAVITY_RATE multiplier. Violations throw `INSUFFICIENT_VAULT_BACKING:<msg>` (message phrased in G); `/matrix/mint` strips the prefix and returns 400. `getVaultStatus()` returns `{ vaultGravity, coreGravity, requiredVault(=core×2), ratio, healthy }`.

## Asset deposit converts ₹ → G
Admin asset deposit takes the real-world `claimedValue` (₹) and adds `claimedValue ÷ GRAVITY_RATE` (G) to the Vault (`gravityIssued = 0`, no owner mint). The asset's ₹ value is the only place ₹ enters; it's immediately converted to gravity. **Why:** backing and supply are both gravity now; minting stays a separate vault-gated action via `/matrix/mint`.

## Re-anchor / migration — `POST /admin/vault/anchor` (admin only)
- `reAnchorCore: true` → sets core gravity = `totalDistributedGravity()`. Migrates legacy core.
- `vaultValue` → sets Vault gravity absolutely. `vaultTopup` → increments Vault gravity. **These are now GRAVITY amounts, not ₹** (no conversion; only log text says "G").
- Response includes `getVaultStatus()`.

**Migration note:** legacy Vault values were ₹ figures now reinterpreted as G (huge, ~200000% ratio). Dev DB was re-anchored to a clean 2.5B G (250% of ~1B core) during verification. PROD founder must re-anchor Vault to a sane gravity value via the Vault tab.

## Display currency is view-only (do not confuse with backing)
Global `CurrencyProvider` (`src/components/currency-provider.tsx`, localStorage key `bu_display_currency`, default `GRAVITY`) + `useCurrency().format(g)` + `<CurrencySelect/>`. It converts gravity → any world currency for DISPLAY ONLY via `currency.ts` FX. It is SEPARATE from the dashboard's own `bu_pref_currency` (leave dashboard untouched) and changes nothing in the DB or backend math.
