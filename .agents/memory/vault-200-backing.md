---
name: Vault vs System Core (1:1 backing)
description: How Gravity backing works — Vault Value (mint backing) is an AGGREGATE = System Vault 001 + all 5 system pools (fees count), gated at 200% of System Core. Soft backing flywheel. Display currency is a separate view-only layer.
---

# Vault vs System Core backing model

Two distinct system accounts, do not conflate them. **Both store GRAVITY** in `gravityBalance`:

- **System Core `000000000000`** (type "System Core") — holds the TOTAL minted Gravity as an odometer. On mint it does BOTH `core += gravity` AND distributes the gravity to pools, so core always equals the sum of all distributed gravity.
- **System (Reserve) Vault `000000000001`** (type "Vault") — holds GRAVITY from approved real assets + revaluation. `gravityBalance` = gravity (NOT ₹). NO LONGER the only backing pool — mint reads the AGGREGATE Vault Value (see section below). Prefix `0` keeps it out of citizen clusters (safe).
- **Users Vault `000000000002`** (type "Vault") — holds GRAVITY from user custody locks (custody lock/revalue/release hit THIS, not the System Vault). Visible + counted in "Total Vault" (System+Users) for display, but NEVER backs minting. See `mint-vault-registry-only.md`.

**Why (changed):** Vault used to store ₹ in `gravityBalance`. Now everything backend-side is gravity-vs-gravity. Do NOT revert Vault to ₹ or re-introduce `× GRAVITY_RATE` into the invariant.

## Invariant (enforced in `mintGravity`)
`vaultGravity ≥ VAULT_BACKING_RATIO × coreGravity` where `VAULT_BACKING_RATIO = 2` (**200%**). **`vaultGravity` is now the AGGREGATE Vault Value (System Vault 001 + all 5 pools), see "Vault Value is an AGGREGATE" below — NOT just account 001.** The gate is effectively `aggregate vault ≥ 2 × (core + amount)` (the asset's own value, since approval already added it to the Vault, must still be present in the Vault to mint its match into Core). Pure gravity-vs-gravity, no GRAVITY_RATE multiplier. Violations throw `INSUFFICIENT_VAULT_BACKING:<msg>` (phrased in G); callers strip the prefix and return 4xx. **Why "1:1" / "piche-aage same":** asset value V is created TWICE — approval locks V into the Vault (backing), mint creates a matching V in System Core. Total = 200% of V but the Vault-vs-Core *invariant* is 1:1. NO recursion.

## Vault Value is an AGGREGATE — assets + revaluation + fees all COUNT (do not revert)
Mint backing (`getVaultStatus().vaultGravity`) and every UI "Vault Value" / backing % = **live sum of System Vault 001 + Foundation 111 + Reserve 222 + Stability 333 + Security 444 + Growth 555**. Fees are NOT physically moved into the Vault — the 1% P2P/escrow fees still land in the Foundation pool — but they COUNT toward backing because Foundation is in the aggregate. Real assets + revaluation already credit 001; fees credit 111; so all three raise the backing live.
**Why:** user's intended flywheel — supply ↑ → fees ↑ → system value (Vault Value) ↑ → more mint headroom. Backing is therefore **soft** (system-retained value that grows with the system), NOT a hard external-asset peg. Threshold = **200%** (`VAULT_BACKING_RATIO = 2`), matching the UI labels that always advertised 200%.
**How to apply:** keep the SAME 6-account set in all three places — `getVaultStatus` (matrixEngine.ts), Home card (App.tsx), universe-control-space.tsx — or the displays/mint-gate drift apart. Do NOT revert `vaultGravity` to "001 only" or the ratio to 1.

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
