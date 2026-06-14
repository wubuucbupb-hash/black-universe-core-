---
name: Account-number allocation is gap-fill
description: Citizen Matrix account numbers reuse the lowest free suffix per cluster; do not revert to a monotonic counter.
---

Citizen account numbers (12 chars = cluster digit 1-9 + 11-digit zero-padded suffix) are allocated by **gap-fill**: `provisionCitizenAccount` picks the LOWEST free numeric suffix (>=1) within the cluster, then inserts with `onConflictDoNothing().returning()` and retries on a PK collision. Numbers freed by hard-deleting an account are therefore auto-allotted to the next real registrant.

**Why:** The old design used a monotonic `cluster_counters` counter that only incremented, so deleted test accounts left their numbers skipped forever. The user explicitly wanted freed numbers reused by real users.

**How to apply:**
- Do NOT reintroduce counter-based ("next number") allocation — it breaks reuse.
- `cluster_counters` table is now vestigial (left in schema to avoid a risky `push` migration; its rows were cleared). Allocation reads only `matrix_accounts`.
- System core accounts (e.g. `111111111111`) share a cluster prefix but have huge suffixes, so they are treated as taken without blocking low numbers like `100000000001`. Already-taken real accounts (e.g. Namastey `500000000001`) are correctly skipped.
- The all-rows-per-cluster scan is O(n); fine at current scale, but move gap discovery into SQL if citizen counts grow large.
- **Dev/prod collision danger:** because dev and prod are separate DBs AND numbers are gap-fill-reused, the SAME account number maps to DIFFERENT real entities per environment (e.g. `500000000001` = Namastey in dev but was an orphan "Kuldeep singh" in prod). Any admin action keyed by account number (delete/archive/transfer) is environment-sensitive — always confirm WHICH env (dev preview vs published app) before destructive ops, or you nuke the wrong person.
- Orphan accounts (no linked user, e.g. after a user hard-delete) can still hold real gravity; check `gravity_balance` + reverse inbound transfers before deleting, else that gravity is permanently destroyed (not returned to sender).
