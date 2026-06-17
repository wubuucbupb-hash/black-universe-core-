---
name: Gravity atomic transfers vs display rounding
description: Why a 0.0001 Gravity transfer "shows 00" — it is a display-format issue, not a real transfer/storage bug.
---

# Gravity atomic transfers vs display rounding

A 0.0001 Gravity transfer **is** processed and stored correctly. Do NOT chase a phantom truncation bug when a user reports "0.0001 transfer karta hu toh 00 hi hota hai".

**Why:** both `matrix_transactions.amount` and `matrix_accounts.gravity_balance` are `numeric(30,6)` (scale 6), and the server (`adjustBalance` + `logTx` amount column) writes via `.toFixed(6)`, so 0.0001 stores as `0.000100`. The server transfer guard is only `Number(amount) <= 0`, so any positive amount passes.

**The real cause of "shows 00":** the frontend money formatters round to 2 decimals. There are THREE separate copies, each must be fixed:
- `fmt` in `pages/matrix.tsx`
- `fmtG` in `pages/dashboard.tsx`
- `fmt` in `pages/vault.tsx`

Fix = set `maximumFractionDigits: 6` (keep `minimumFractionDigits: 2`) so normal amounts still look like money but atomic amounts show in full.

**Also:** the `<input type="number">` `step` attribute silently blocks decimals in the browser. The transfer/escrow amount inputs had `step="1"` / `step="0.01"` / `step="100"`; all must be `step="0.0001"` to let users enter atomic values.

**How to apply:** if a small-decimal amount "disappears" anywhere, first check the formatter's `maximumFractionDigits` and the input `step`, not the server. Note `logTx`'s human-readable description string still bakes `toFixed(2)`, but the history UI renders `fmt(tx.amount)` off the 6-decimal column, so the description text is cosmetic only.
