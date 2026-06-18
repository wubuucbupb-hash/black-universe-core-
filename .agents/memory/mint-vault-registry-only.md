---
name: Custody pays the owner from the Growth pool — asset is NOT collateral
description: Custody lock/revalue/release move Gravity between the owner and the Growth pool (debit real minted Gravity, never thin-air); the asset is not collateral and the Users Vault is OUT of the custody money flow. Only admin approve/deposit move the System Vault; mint draws against the System Vault only, gated 200%.
---

# Custody issuance comes OUT of the Growth pool; the asset is not collateral

When a user's asset is locked in custody the owner is PAID its Gravity value
(`valuation / GRAVITY_RATE`) out of a system pool that already holds **minted**
Gravity. The asset is **NOT collateral** and **no Gravity is created from thin
air** — every custody value path debits/credits a real pool.

- **Source pool depends on asset/value type.** Today only "normal" is defined →
  the **Growth pool `555555555555`** (`GROWTH_ACCOUNT`). `sourcePoolFor(assetType)`
  in `custody.ts` is the single mapping point; extend it for other types.
- Custody routes (`artifacts/api-server/src/routes/custody.ts`), all atomic, with
  the pool/owner row locked `FOR UPDATE` + strict 0-floor (`INSUFFICIENT_POOL` /
  `INSUFFICIENT_OWNER`):
  - **Lock**: debit Growth pool, credit owner by `valuation/GRAVITY_RATE`. Logs `CUSTODY_ISSUE`.
  - **Revalue** (founder-only): delta `(new-old)/RATE` > 0 → pay owner the extra from the Growth pool AND grow the **System Vault** (`VAULT_ACCOUNT` 001) backing by the same delta (pure increment, like admin approve — not minted). delta < 0 → ONLY update the recorded valuation; **never claw back from the owner AND never shrink the System Vault** (a value fall is not the owner's doing). So both the owner payout and the Vault backing only ever go UP on revalue, never down. Revalue no longer throws `INSUFFICIENT_OWNER`. NOTE: this is the ONE deliberate exception to "custody never touches the System Vault" — it applies to revalue-up only; lock/release still never touch the System Vault.
  - **Release** (plain, non-escrow): claw the issued Gravity back from owner → Growth pool (mirror of lock; owner must still hold it). Escrow release keeps its receiver-credit + 1% founder-fee path untouched.

**Why:** user rejected the earlier "credit the Users Vault + mint-free issue to
the owner against their asset" model — that was thin-air issuance and made the
asset collateral, which defeats the point of the system minting at all. Issuance
must come out of already-minted Gravity (Growth pool), not be conjured.

**How to apply:**
- The **Users Vault `000000000002`** (`USERS_VAULT`) is now OUT of the custody
  money flow — custody routes no longer touch it (it stays 0). Do NOT re-wire
  custody to credit/debit the Users Vault. `USERS_VAULT` is no longer imported in `custody.ts`.
- **System Vault `000000000001`** (`VAULT_ACCOUNT`) — still the ONLY mint backing.
  The backing grows from TWO sources only and never goes down: (1) admin **approve** + **deposit** (new asset submissions), and (2) **revalue-up** delta (see above). **Transaction revenue does NOT touch the vault** — the user explicitly reversed an earlier "fees also grow the vault" attempt. P2P/escrow 1% fees (and mint's `founderCut`) accrue to the **Foundation account `111111111111`** ONLY; `flushPendingFees` just credits the pool account, no vault side-effect. The Foundation balance IS the running fee/revenue total. **Mint** (`POST /api/matrix/mint`) is a pure DRAW against the System Vault, gated 200% (`vaultGravity >= VAULT_BACKING_RATIO * coreGravity`). The vault is never decreased by any normal flow; never point custody at `VAULT_ACCOUNT`.
- **Fee/vault visibility UI.** UCS vault banner (`universe-control-space.tsx`) shows a "💰 Foundation Fees" stat = Foundation `111…` balance (the live fee total). The vault.tsx revalue form shows a live preview of the vault delta: up → "+X G → System Vault backing", down → "Valuation only · System Vault unchanged (value never falls)".
- **"Founder" → "Foundation" rename (user-facing only).** Account `111111111111` is now "Black Universe — Foundation Account" / type "Foundation Core" (DB row updated + `ensureSystemAccounts.ts`). All user-visible strings say "Foundation" (UI labels, error msgs like "Foundation Root access required", tx descriptions). But internal code identifiers stay `FOUNDER_ACCOUNT` / `isFounder` / `founderCut` — do NOT rename these (kept to avoid a risky wide refactor). "Founder" in code is the same persona as "Foundation" in the UI.
- `getVaultStatus()` still returns `vaultGravity`/`usersVaultGravity`/`totalVaultGravity`; `usersVaultGravity` will read 0 going forward (custody no longer feeds it). Banner still renders all three.
- The vault lock form (vault.tsx) mirrors the mint form's currency selector; typed amount → canonical ₹ in `lockForm.valuation` (server ÷ `GRAVITY_RATE`).
