---
name: Money-flow atomicity & invariants
description: The hardened invariants every value-mutating API path must keep. Do NOT revert these.
---

All value-mutating Black Universe routes are now transaction-safe. These are the
durable invariants — treat them as constraints, not suggestions, and do not
"simplify" them back to the older non-atomic shapes.

- **Every multi-write money path runs inside one `db.transaction` with row locking.**
  Sender (and other mutated wallet rows) are taken with `SELECT … FOR UPDATE`
  INSIDE the tx, then balance is re-checked, then debited/credited. Applies to:
  P2P transfer, equity/buy, INR→Gravity admin-approve, custody escrow + release.
  **Why:** without the lock, concurrent requests read a stale balance and race past
  the check (overdraft / double-credit). Proven via a 30-concurrent-transfer race
  test: only the affordable N succeed, balance never goes negative.

- **Strict balance floor of 0 — this REVERSES the old "overage by design" note.**
  Transfer blocks if `amount + 1% fee` would push the wallet below 0; it no longer
  lets the fee drive a balance negative. **Why:** an overdraftable wallet is a drain
  vector under concurrency. Do not reintroduce a negative-allowed path.

- **`senderAccount` is gone from the transfer API.** A transfer ALWAYS moves the
  authenticated user's own wallet (`user.accountNumber`); even admins cannot pass an
  arbitrary source. **Why:** removed the single catastrophic "move funds from any
  account" capability.

- **Pool fees are buffered, not credited inline.** Within the money tx the fee is
  appended to the durable `pending_fees` table; a 60s background flusher aggregates
  by pool account and credits it (uses `FOR UPDATE SKIP LOCKED` + an in-process
  `flushing` guard). **Why:** crediting shared pool rows (FOUNDER, etc.) inside every
  transfer serializes the whole system on those hot rows. Don't move pool credits
  back into the request path. Value is conserved: debit happens in the tx, the buffer
  is the deferred half.

**How to apply:** before editing transfer / equity / approve / custody, keep the
tx + `FOR UPDATE` + floor + `recordPoolFee(...)` shape. Never assume these paths are
race-safe without the lock; never inline pool credits; never re-add `senderAccount`.
