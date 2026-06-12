---
name: matrix/accounts public contract
description: Why GET /api/matrix/accounts is public yet must stay PII-stripped
---

# GET /api/matrix/accounts is public-by-design but PII-stripped

The endpoint returns only `accountNumber, name, type, cluster, gravityBalance, createdAt`.
It must NOT return `phone`, `email`, or `nationalIdHash`.

**Why:** The logged-out Home page intentionally shows the live system pools and
registered-citizen names/balances, so the endpoint cannot require auth. But every
real signup now provisions a matrix account carrying contact PII (phone/email), so a
plain `select()` here would let any anonymous caller dump all users' contact info.
The fix is a column projection, not auth.

**How to apply:** Never change this route's `select({...})` back to `select()` and
never "secure" it by adding a session gate (that breaks the public Home preview).
Founder custody/decryption uses the separate founder-only `/api/custody/vault` route.
