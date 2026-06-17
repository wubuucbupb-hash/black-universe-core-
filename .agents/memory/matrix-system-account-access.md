---
name: Matrix system-account access & documented mint
description: Why admins (not citizens) can transfer via System Main/Reserve Vault, and how the Founder Mint records its proof documents.
---

## Admin transfer access to system accounts
matrix.tsx keeps regular citizens from seeing System Main (`000000000000`) and Reserve Vault (`000000000001`) in the P2P transfer dropdowns, but **admins intentionally see the full account list** (`transferWallets = isAdmin ? accounts : allWallets`).

**Why:** The founder needs to route real value through System Core / Reserve Vault. Do NOT "re-lock" by removing these from the admin dropdowns thinking it's a PII/leak regression — it is a deliberate founder capability.

**How to apply:** Admin P2P from/to the Vault is allowed because a transfer is auditable and conserves total gravity. This is distinct from the removed arbitrary `/admin/vault/anchor` endpoint (which conjured numbers). Keep transfers enabled; do not reintroduce arbitrary balance-setting.

## Founder Mint is document-backed
The `/matrix/mint` endpoint accepts optional `documentUrls` / `assetType` / `description`. When `documentUrls` is present it writes an `assetsTable` row with `status: "minted"` and `mintedAt: now` so the proof papers are retained/visible in the registry and the record can never be re-deposited through the normal approval pipeline.

**Why:** Frontend (matrix.tsx) REQUIRES proof docs on mint, but the backend keeps them optional so the other mint form (universe-control-space) — which sends no docs — keeps working. Don't make backend docs mandatory or that form breaks.
