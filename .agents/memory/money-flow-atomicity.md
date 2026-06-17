---
name: Money-flow atomicity gaps
description: Which value-mutating API paths are NOT transaction-safe and must be hardened before scaling.
---

Audit of the Black Universe value-mutating routes found these durable gaps:

- **P2P transfer (`matrix/transfer`)** does a balance check then 4 sequential
  `adjustBalance` writes with **no `db.transaction`** → concurrent transfers from
  the same wallet can race past the "Insufficient balance" check (overdraft / drain).
- **`custody/release`** credits receiver + updates status non-atomically → an admin
  retry after partial failure can **double-credit**.
- **`adjustBalance` has no negative floor** — the 1% transfer charge can push a
  wallet negative ("overage"); this is currently by design.
- **`custody/lock` is open to any citizen** with arbitrary `ownerAccount` /
  `valuation` (pollutes the audit ledger). Should be admin-only or owner-forced.
- **Admins can pass `senderAccount`** on transfer to move funds from any account
  (powerful but single catastrophic point if an admin is compromised).

Already safe (do NOT "fix" again): `matrix/equity/buy` and the INR→Gravity
admin-approve path ARE wrapped in `db.transaction`; approve has a double-approve
status guard + reserve-balance check; mint is admin-only with a 200% backing check.

**Why:** money correctness must precede horizontal scaling — adding API replicas
multiplies the race window on the non-atomic paths.

**How to apply:** before scaling or editing these routes, wrap each multi-write
money path in a single transaction with row locking (`SELECT … FOR UPDATE`) or
atomic conditional updates. Never assume transfer/escrow are race-safe.
