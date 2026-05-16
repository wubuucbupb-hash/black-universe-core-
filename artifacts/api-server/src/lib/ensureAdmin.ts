import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Reads ADMIN_EMAIL + ADMIN_PASSWORD from environment variables and upserts
 * the admin user on every server start. The plaintext password never touches
 * any code file — it lives only in the secret env var and is immediately
 * replaced by a bcrypt hash before any DB write.
 */
export async function ensureAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.warn("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin upsert");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);

  if (existing) {
    await db
      .update(usersTable)
      .set({ email, passwordHash, name: "Black Universe Admin" })
      .where(eq(usersTable.id, existing.id));
    logger.info({ email }, "Admin credentials updated from environment");
  } else {
    await db.insert(usersTable).values({
      name: "Black Universe Admin",
      email,
      passwordHash,
      role: "admin",
    });
    logger.info({ email }, "Admin user created from environment");
  }
}
