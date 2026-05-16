import { Router } from "express";
import bcrypt from "bcrypt";
import { timingSafeEqual } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  RegisterUserBody,
  LoginUserBody,
} from "@workspace/api-zod";

const router = Router();

/**
 * Constant-time string comparison so timing attacks cannot reveal
 * whether the admin email/password env vars are set.
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

router.post("/users/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, password } = parsed.data;

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
    .values({ name, email, passwordHash, role: "user" })
    .returning();

  req.session.userId = user.id;

  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
});

router.post("/users/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  // ── Admin fast-path ───────────────────────────────────────────────────────
  // If the submitted email matches ADMIN_EMAIL, validate directly against the
  // ADMIN_PASSWORD secret — no bcrypt hash in the DB is required. This works
  // even before ensureAdmin() has had a chance to write a DB record.
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword && safeEqual(email, adminEmail)) {
    if (!safeEqual(password, adminPassword)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Find or create the admin DB record so we have a real user id for the session
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
    } else if (!safeEqual(adminUser.email, adminEmail)) {
      // Keep DB record in sync with the env var
      await db
        .update(usersTable)
        .set({ email: adminEmail })
        .where(eq(usersTable.id, adminUser.id));
      adminUser.email = adminEmail;
    }

    req.session.userId = adminUser.id;
    res.json({
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        createdAt: adminUser.createdAt,
      },
    });
    return;
  }
  // ── End admin fast-path ───────────────────────────────────────────────────

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

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

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
});

router.post("/users/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

export default router;
