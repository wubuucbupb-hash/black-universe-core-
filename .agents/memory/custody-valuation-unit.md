---
name: Custody valuation is stored in ₹ (INR), not Gravity
description: custody_ledger valuation + escrow units, and how the vault UI must present them
---

# Custody valuation unit

`custody_ledger.valuationEncrypted` (decrypted as `e.valuation`) holds the asset value in **₹ (INR)**, exactly like `assets.claimedValue`. Gravity = `valuation / GRAVITY_RATE` (₹10,000 = 1 G). The separate `escrowAmount` field is already in **Gravity**.

The summary `totalLockedValue` is the backend **sum of ₹ valuations** — it is NOT Gravity.

**Why:** the whole app is Gravity-native (system accounts, dashboard, admin registry, vault banner all show G). The vault page used to show custody entries as `₹ {valuation}` and the "TOTAL LOCKED GRAVITY VALUE" banner printed the raw ₹ sum with a "Gravity" label → looked 10,000× too big and mismatched the Gravity value entered on the asset-declaration form. Users read that as a "gravity/inr mismatch".

**How to apply:** any vault/custody DISPLAY that wants Gravity must divide `valuation` (and `totalLockedValue`) by `GRAVITY_RATE`. The admin REVALUE input is shown in Gravity, so it must multiply the typed value by `GRAVITY_RATE` before POSTing (backend expects ₹) — getting this wrong = 10,000× over/under-pay of Gravity from the Growth pool. Keep ₹ only as a secondary "backing" reference.
