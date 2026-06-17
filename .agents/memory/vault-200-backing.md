---
name: Vault vs System Core (200% backing)
description: How Gravity backing is split — Vault holds ₹ value, System Core is the minted-gravity odometer, with a 200% invariant.
---

# Vault vs System Core backing model

Two distinct system accounts, do not conflate them:

- **System Core `000000000000`** (type "System Core") — holds the TOTAL minted Gravity as an odometer. On mint it does BOTH `core += gravity` AND distributes the gravity to pools, so core always equals the sum of all distributed gravity. It does NOT hold ₹ value anymore.
- **Reserve Vault `000000000001`** (type "Vault") — holds the ₹ rupee value that backs the system. `gravityBalance` column is reused to store ₹ (not gravity). Prefix `0` keeps it out of citizen clusters (safe).

## Invariant (enforced in `mintGravity`)
`vaultValue ≥ VAULT_BACKING_RATIO × coreGravity × GRAVITY_RATE` where `VAULT_BACKING_RATIO = 2` (200%) and `GRAVITY_RATE = 10000` (₹10000 = 1 G). Violations throw `INSUFFICIENT_VAULT_BACKING:<msg>`; the `/matrix/mint` route strips the prefix and returns 400.

## Behavior change — asset deposit no longer mints
Admin asset deposit adds `claimedValue` to the Vault only (`gravityIssued = 0`), NO gravity minted for the owner. Custody lock kept. **Why:** backing (₹) is now separated from supply (gravity); minting is a separate, vault-gated action via `/matrix/mint`. Do not re-add owner gravity rewards on deposit.

## Re-anchor / migration — `POST /admin/vault/anchor` (admin only)
- `reAnchorCore: true` → sets core gravity = `totalDistributedGravity()` (sum of all non-core/non-vault accounts). Migrates legacy core.
- `vaultValue` → sets Vault ₹ absolutely. `vaultTopup` → increments Vault ₹.
- Response includes `getVaultStatus()` { coreGravity, vaultValue, requiredVault, ratio, healthy }.

**Why re-anchor exists:** legacy prod System Core held ₹10.12T as gravity under the old asset-backing model. Under the new model that 10T is wrong. The agent CANNOT write the prod DB — the **founder must re-anchor in PROD** via the Vault tab (re-anchor core + top up vault to ≥200%) before any prod mint will succeed. Dev DB was already re-anchored to circulating supply (~1B) during verification.
