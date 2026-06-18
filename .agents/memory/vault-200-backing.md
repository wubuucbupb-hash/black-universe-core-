---
name: Vault vs System Core (1:1 backing)
description: How Gravity backing is split — BOTH Vault and System Core are counted in Gravity, with a gravity-vs-gravity 1:1 invariant. Mint is per-asset. Display currency is a separate view-only layer.
---

# Vault vs System Core backing model

Two distinct system accounts, do not conflate them. **Both store GRAVITY** in `gravityBalance`:

- **System Core `000000000000`** (type "System Core") — holds the TOTAL minted Gravity as an odometer. On mint it does BOTH `core += gravity` AND distributes the gravity to pools, so core always equals the sum of all distributed gravity.
- **Reserve Vault `000000000001`** (type "Vault") — holds GRAVITY that backs the system. `gravityBalance` = gravity (NOT ₹). Prefix `0` keeps it out of citizen clusters (safe).

**Why (changed):** Vault used to store ₹ in `gravityBalance`. Now everything backend-side is gravity-vs-gravity. Do NOT revert Vault to ₹ or re-introduce `× GRAVITY_RATE` into the invariant.

## Invariant (enforced in `mintGravity`)
`vaultGravity ≥ VAULT_BACKING_RATIO × coreGravity` where `VAULT_BACKING_RATIO = 1` (1:1). The gate is effectively `vault ≥ core + amount` (the asset's own value, since approval already added it to the Vault, must still be present in the Vault to mint its match into Core). Pure gravity-vs-gravity, no GRAVITY_RATE multiplier. Violations throw `INSUFFICIENT_VAULT_BACKING:<msg>` (phrased in G); callers strip the prefix and return 4xx. **Why "1:1" / "piche-aage same":** asset value V is created TWICE — approval locks V into the Vault (backing), mint creates a matching V in System Core. Total = 200% of V but the Vault-vs-Core *invariant* is 1:1. NO recursion.

## Two-step asset lifecycle: approve (lock) → mint (create)
- **Approve** (`POST /admin/assets/:id/approve`): status `pending`→`approved`, adds `claimedValue ÷ GRAVITY_RATE` (G) to the Vault as backing. Does NOT set `mintedAt`, does NOT issue owner gravity. Approved assets are Vault-locked (not deletable).
- **Mint** (`POST /admin/assets/:id/mint`): status `approved`→`minted`, sets `mintedAt`, calls `mintGravity` which creates the matching V in System Core (1:1) and distributes it (Founder 1% / Reserve 24% / Stability 25% / Security 25% / Growth 25%); only Growth 25% flows OUT to `GROWTH_ACCOUNT`. Stamps `gravityIssued = gravityTotal`. 409 if not `approved`. **Why separate:** lets the founder control supply creation independently of accepting backing. Do NOT re-merge mint into approve.
- `assets.status` is plain text (no pg enum) so `"minted"` needs no migration. Both `Asset` and `AssetWithUser` openapi enums include `minted`.

## Asset deposit converts ₹ → G (now vestigial)
The old `depositAsset` path (₹→G into Vault, no UI button) is vestigial — the approve step now does the Vault backing. Leave as-is, don't wire UI back to it.

## Re-anchor / migration — `POST /admin/vault/anchor` (admin only)
- `reAnchorCore: true` → sets core gravity = `totalDistributedGravity()`. Migrates legacy core.
- `vaultValue` → sets Vault gravity absolutely. `vaultTopup` → increments Vault gravity. **These are now GRAVITY amounts, not ₹** (no conversion; only log text says "G").
- Response includes `getVaultStatus()`.

**Migration note:** legacy Vault values were ₹ figures now reinterpreted as G (huge, ~200000% ratio). Dev DB was re-anchored to a clean 2.5B G (250% of ~1B core) during verification. PROD founder must re-anchor Vault to a sane gravity value via the Vault tab.

## Display currency is view-only (do not confuse with backing)
Global `CurrencyProvider` (`src/components/currency-provider.tsx`, localStorage key `bu_display_currency`, default `GRAVITY`) + `useCurrency().format(g)` + `<CurrencySelect/>`. It converts gravity → any world currency for DISPLAY ONLY via `currency.ts` FX. It is SEPARATE from the dashboard's own `bu_pref_currency` (leave dashboard untouched) and changes nothing in the DB or backend math.
