---
name: Universal currency + live FX in transfer form
description: How the matrix transfer form supports any world currency and why live rates exist
---

The transfer form (asset-verify `pages/matrix.tsx` + `lib/currency.ts`) must work
with ANY world currency, not a fixed shortlist — a Black Universe citizen can be
from anywhere.

Design:
- Gravity is the source of truth. Anchor: ₹10,000 of local value = 1 Gravity
  (`GRAVITY_RATE`). Every other currency converts through its INR value.
- Selectable list = full ISO-4217 set via `Intl.supportedValuesOf("currency")`
  (fallback: distinct values of `COUNTRY_CURRENCY` + static keys).
- Live rates fetched client-side from `https://open.er-api.com/v6/latest/INR`
  (free, no API key, CORS-open). Cached in localStorage 6h. Stored as
  INR-per-unit = 1 / rate.
- `STATIC_INR_PER_UNIT` is the OFFLINE FALLBACK only — keep it; do not assume the
  app always has live rates.
- Default currency auto-detected from browser locale region via
  `COUNTRY_CURRENCY` (ISO-3166 → ISO-4217), falling back to INR.

**Why:** user explicitly asked for "compatible with everyone, from anywhere."
**How to apply:** do NOT revert to a hardcoded 10-currency list or strip the
live-FX fetch. If a currency has no known rate (exotic + offline), the local
input is disabled and the citizen enters Gravity directly — keep that graceful
path; never block the transfer just because FX is unknown.
