import { Router } from "express";
import bcrypt from "bcrypt";
import { timingSafeEqual } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { provisionCitizenAccount, VALID_CLUSTERS } from "../lib/matrixEngine";

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

  if (!user) {
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

// ── Reset password ────────────────────────────────────────────────────────────
router.post("/users/reset-password", async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and new password are required" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        or(eq(usersTable.email, email), eq(usersTable.phoneNumber, email)),
      )
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, user.id));

    res.json({ message: "Password updated successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Reset failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
