import { Router } from "express";
import bcrypt from "bcrypt";
import { timingSafeEqual, randomBytes, createHash } from "crypto";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq, or, and, gt, isNull, desc } from "drizzle-orm";
import { provisionCitizenAccount, VALID_CLUSTERS } from "../lib/matrixEngine";

// Password-reset tokens live for 30 minutes and are single-use.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const router = Router();

/**
 * Constant-time string comparison — prevents timing attacks that could
 * reveal whether ADMIN_EMAIL / ADMIN_PASSWORD env vars are set.
 */
function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function userResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phoneNumber: user.phoneNumber,
    accountNumber: user.accountNumber,
    createdAt: user.createdAt,
  };
}

// ── Register ──────────────────────────────────────────────────────────────────
router.post("/users/register", async (req, res): Promise<void> => {
  try {
    const { name, email, phoneNumber, password, cluster } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (cluster != null && !VALID_CLUSTERS.includes(String(cluster) as (typeof VALID_CLUSTERS)[number])) {
      res.status(400).json({ error: "Invalid network cluster" });
      return;
    }

    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(usersTable)
      .values({ name, email, phoneNumber: phoneNumber ?? null, passwordHash, role: "citizen" })
      .returning();

    // Auto-provision a linked Matrix account so gravity can later be issued.
    const accountNumber = await provisionCitizenAccount({
      name: name || email,
      phone: phoneNumber,
      email,
      cluster: cluster != null ? String(cluster) : undefined,
    });
    const [linkedUser] = await db
      .update(usersTable)
      .set({ accountNumber })
      .where(eq(usersTable.id, user.id))
      .returning();

    req.session.userId = user.id;
    res.status(201).json({ user: userResponse(linkedUser) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Registration failed";
    res.status(500).json({ error: msg });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post("/users/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  // ── Admin fast-path ────────────────────────────────────────────────────────
  // Validates directly against ADMIN_EMAIL + ADMIN_PASSWORD env vars so the
  // admin can log in even if the DB record has stale credentials.
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword && safeEqual(email, adminEmail)) {
    if (!safeEqual(password, adminPassword)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Find or create admin DB record for session tracking
    let [adminUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .limit(1);

    if (!adminUser) {
      const hash = await bcrypt.hash(adminPassword, 12);
      [adminUser] = await db
        .insert(usersTable)
        .values({ name: "Black Universe Admin", email: adminEmail, passwordHash: hash, role: "admin" })
        .returning();
    } else if (!safeEqual(adminUser.email ?? "", adminEmail)) {
      await db
        .update(usersTable)
        .set({ email: adminEmail })
        .where(eq(usersTable.id, adminUser.id));
      adminUser.email = adminEmail;
    }

    req.session.userId = adminUser.id;
    res.json({ user: userResponse(adminUser) });
    return;
  }
  // ── End admin fast-path ────────────────────────────────────────────────────

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      or(eq(usersTable.email, email), eq(usersTable.phoneNumber, email)),
    )
    .limit(1);

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.archivedAt) {
    res.status(403).json({ error: "This account has been deactivated." });
    return;
  }

  req.session.userId = user.id;
  res.json({ user: userResponse(user) });
});

// ── Current user ──────────────────────────────────────────────────────────────
router.get("/users/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.archivedAt) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(userResponse(user));
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post("/users/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

// ── Forgot password (request a reset token) ─────────────────────────────────────
// Step 1 of the reset flow. Issues a time-limited, single-use token bound to the
// account. The token is never derivable from the email — it is random and only
// its SHA-256 hash is stored. It must reach the account owner out-of-band.
//
// NOTE: No email/SMS provider is wired up yet, so the raw token is logged
// server-side for out-of-band delivery. As a convenience for development and
// preview environments only, it is also returned in the response body; in
// production the token is NEVER returned to the caller.
router.post("/users/forgot-password", async (req, res): Promise<void> => {
  try {
    const { email } = req.body ?? {};

    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        or(eq(usersTable.email, email), eq(usersTable.phoneNumber, email)),
      )
      .limit(1);

    // Always respond the same way to avoid leaking which accounts exist.
    const genericMessage =
      "If an account matches, a password reset code has been issued.";

    if (!user) {
      res.json({ message: genericMessage });
      return;
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    req.log.info(
      { userId: user.id, expiresAt },
      "Password reset token issued (deliver out-of-band)",
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.json({
      message: genericMessage,
      ...(isProduction ? {} : { token }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Request failed";
    res.status(500).json({ error: msg });
  }
});

// ── Reset password (consume a reset token) ──────────────────────────────────────
// Step 2 of the reset flow. Requires a valid, unexpired, unused token. The token
// is marked used in the same transaction as the password change, so it can never
// be replayed.
router.post("/users/reset-password", async (req, res): Promise<void> => {
  try {
    const { token, password } = req.body ?? {};

    if (!token || !password) {
      res.status(400).json({ error: "Token and new password are required" });
      return;
    }

    if (typeof password !== "string" || password.length < 6) {
      res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
      return;
    }

    const tokenHash = hashResetToken(token);

    const [resetRow] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(passwordResetTokensTable.createdAt))
      .limit(1);

    if (!resetRow) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.transaction(async (tx) => {
      // Atomically claim the token so a concurrent request can't reuse it.
      const [claimed] = await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokensTable.id, resetRow.id),
            isNull(passwordResetTokensTable.usedAt),
          ),
        )
        .returning();

      if (!claimed) {
        throw new Error("TOKEN_ALREADY_USED");
      }

      await tx
        .update(usersTable)
        .set({ passwordHash })
        .where(eq(usersTable.id, resetRow.userId));
    });

    res.json({ message: "Password updated successfully" });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "TOKEN_ALREADY_USED") {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }
    const msg = err instanceof Error ? err.message : "Reset failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
