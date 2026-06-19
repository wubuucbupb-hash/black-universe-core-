import { createHmac, timingSafeEqual } from "crypto";

// Stateless bearer tokens for non-browser clients (the mobile app).
//
// Web clients authenticate with the express-session cookie. React Native /
// Expo Go cookie handling is unreliable, so mobile clients instead receive a
// signed token at login/register and send it as `Authorization: Bearer <token>`.
//
// The token is an HMAC-signed `{userId, tokenVersion, expiresAt}` payload. The
// tokenVersion is checked against the user's current value at auth time, so
// bumping a user's tokenVersion (e.g. on password reset) revokes every
// previously issued token. The signing key is the existing SESSION_SECRET, so
// tokens share the lifecycle of the session secret.

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — matches session cookie maxAge

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET must be set to sign auth tokens.");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Issue a signed bearer token for a user. */
export function issueAuthToken(userId: number, tokenVersion: number): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${userId}.${tokenVersion}.${expiresAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/**
 * Verify a bearer token. Returns the userId when valid (correct signature and
 * not expired), or null otherwise.
 */
export function verifyAuthToken(
  token: string,
): { userId: number; tokenVersion: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [userIdRaw, tokenVersionRaw, expiresAtRaw, sig] = parts;
  const payload = `${userIdRaw}.${tokenVersionRaw}.${expiresAtRaw}`;
  const expected = sign(payload);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const tokenVersion = Number(tokenVersionRaw);
  if (!Number.isInteger(tokenVersion) || tokenVersion < 0) return null;

  return { userId, tokenVersion };
}
