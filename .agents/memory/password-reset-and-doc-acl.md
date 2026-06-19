---
name: password reset & asset-doc access control
description: Security contract for password-reset flow and private object serving
---

# Password reset must stay token-based; asset docs must stay owner-gated

## Password reset
Reset is a two-step, DB-backed token flow in `users.ts`:
`POST /users/forgot-password` (issues a random 32-byte token, stores only its
SHA-256 hash with a 30-min expiry) → `POST /users/reset-password` (consumes a
valid, unexpired, unused token; marks it used atomically).

**Why:** The app previously had THREE openly-callable reset routes
(`/admin/forgot-password`, `/forgot-password` in admin.ts, and an email+password
`/users/reset-password`). Any one let anyone take over any account by posting an
email + new password. Those routes were deleted.

**How to apply:** Never re-add a reset route that changes a password from
email/phone alone. The raw token is logged server-side and ALSO returned in the
response ONLY when `NODE_ENV !== "production"` (dev/preview self-serve); in
production the token is never returned.

Delivery is wired via the Replit **Gmail connector** (`google-mail`) in
`lib/notify.ts` (`sendPasswordResetCode`), sent through `@replit/connectors-sdk`
`connectors.proxy(...)` — no API key stored; the connected Gmail account is the
sender. SMS/Twilio and Resend were intentionally dropped (cost + India DLT
hassle for SMS; user did not want to manage an email-provider/domain). Do not
re-introduce them without reason. Caveat: real users only receive mail once a
real (non-personal) Gmail is connected and, for arbitrary recipients, the
account can send normally; the testing posture used a dedicated app Gmail.

## Asset document serving
`GET /storage/objects/*` requires a session AND that the caller either owns an
asset whose `documentUrls` contains the requested `/objects/...` path, or has a
privileged role (`admin`/`custodian`). Ownership uses the DB asset→owner mapping
(`arrayContains(assetsTable.documentUrls, [objectPath])`), not GCS ACL metadata.

**Why:** Private asset documents were served with the ACL check commented out —
anyone with/guessing a URL could read another user's documents.

**How to apply:** Run the access check BEFORE `getObjectEntityFile` so existence
isn't leaked to unauthorized callers. Don't revert to serving without the gate.
The sibling `/storage/public-objects/*` route stays intentionally public.

`POST /storage/uploads/request-url` also requires a session (`req.session.userId`)
— without it any anonymous caller could mint presigned upload URLs and dump files
into the bucket. Keep the gate; only `/storage/public-objects/*` is public.

## Bearer token revocation (mobile)
Mobile bearer tokens are HMAC-signed `userId.tokenVersion.expiresAt.sig`
(4-part). The bridge in `app.ts` verifies the signature/expiry AND looks up the
user's current `users.token_version`, only populating the session when they
match. Password reset bumps `token_version` (`+1`) in the same tx, so every
previously issued token is instantly revoked.

**Why:** tokens were originally stateless `userId.expiresAt` with no way to
revoke a leaked/old token before its 7-day expiry — a real risk for a money app.

**How to apply:** Never revert the token to a userId-only payload, and never drop
the DB version check in the bridge, or revocation silently stops working. Any new
"force logout / revoke sessions" action just bumps `users.token_version`. The
column was added via raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (never `push`,
which wants to drop the runtime `session` table).
