---
name: Mint & revalue are custody-registry-only
description: Why minting and revaluation update the custody ledger but never the VAULT_ACCOUNT backing balance or 200% mint gate.
---

# Mint / revalue touch the custody REGISTRY only

- On a successful `POST /api/matrix/mint`, the route inserts a custody_ledger LOCKED entry (owner = FOUNDER_ACCOUNT) so the minted asset shows up in the Vault ledger / totalLockedValue summary.
- `POST /api/custody/revalue/:id` (founder-only) edits an existing entry's encrypted valuation (+optional description). UI lives on the `/vault` page (vault.tsx), gated to non-released, non-escrow entries.
- **Neither** mint-auto-lock **nor** revalue calls `adjustBalance(VAULT_ACCOUNT, ...)`. They do not change the Vault backing balance and do not change the 200% over-collateralization mint gate.

**Why:** the system deliberately decouples backing from issuance. Only deposit (`POST /admin/assets/:id/deposit`) bumps VAULT_ACCOUNT backing; mint issues Gravity against pre-existing backing and is gated at 200%. Counting the minted asset as new backing would be circular (mint against X while X also backs the mint) and would corrupt the collateral ratio. `POST /api/custody/lock` already behaves registry-only (no vault bump), so mint/revalue match that semantics. The custody ledger is a loosely-coupled REGISTRY of locked assets, distinct from the VAULT_ACCOUNT balance.

**How to apply:** if a future request says "minting should grow backing" or "revaluation should change the vault balance", that is a deliberate economic-model change — it must also rework the 200% check (e.g. check `(vault + newAsset) >= 2*(core + newMint)`), not just add an `adjustBalance` call. Do not silently add a VAULT_ACCOUNT bump to these paths.
