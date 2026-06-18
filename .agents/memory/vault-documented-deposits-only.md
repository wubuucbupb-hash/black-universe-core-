---
name: Vault changes only via documented deposits
description: Reserve Vault value is locked to the asset-deposit pipeline; manual anchor/top-up was intentionally removed.
---

The Reserve Vault (account 000000000001) value may change ONLY through the asset pipeline: a real asset with proof documents is submitted → approved. **Approve now auto-locks** — there is no separate manual deposit step. The approve route (admin.ts) does it all in ONE atomic transaction: flip pending→approved, set `mintedAt`, add `claimedValue / GRAVITY_RATE` to the Vault, write a `DEPOSIT` matrix tx, and insert a LOCKED custody entry. It is gated on `status === "pending"` so re-approving can't double-credit the Vault.

**Do NOT re-add a separate "Deposit & Mint" step.** The old `POST /admin/assets/:id/deposit` endpoint still exists but is intentionally unreachable from the UI (the admin Asset Registry button + "✓ Minted" span were removed; approved rows just show "🔒 Locked in Vault"). Mint stays a SEPARATE pure-draw action gated at 200% — approve/lock never mints.

**Why merged:** founder wanted approval and vault-locking to be one action, not two clicks; a half-approved-but-not-deposited state was a footgun.

**Removed on purpose (do NOT re-add):**
- Backend `POST /admin/vault/anchor` (manual top-up / set-absolute-value / core re-anchor) in admin.ts.
- The matrixEngine imports that only fed it: setBalance, getVaultStatus, totalDistributedGravity, SYSTEM_MAIN (still exported from matrixEngine; just not imported in admin.ts).
- The "Top up Vault" + "Re-anchor Vault" UI controls and the vaultForm/vaultMutation in universe-control-space.tsx. The Vault tab now shows the read-only status grid + a "locked to documented deposits" note.

**Also enforced:** proof-document upload is REQUIRED on asset submit (universe-control-space onSubmit guards `uploadedDocs.length > 0`).

**Why:** founder wants the Vault backed by real papers/terms/legal, and the value must NOT be settable to arbitrary numbers — after a documented deposit it stays fixed until the next documented deposit. Re-introducing any manual anchor/top-up lever breaks this guarantee.
