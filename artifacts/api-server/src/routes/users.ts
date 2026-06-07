import { Router } from "express";
import type { Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const router = Router();

// 1. Reset Password Route
router.post("/users/reset-password", async (req, res): Promise<void> => {
  console.log("--- Reset Password Request Hit ---");
  try {
    const { email, password } = req.body;
    console.log("Email received:", email);

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (users.length === 0) {
      console.log("User not found in DB");
      res.status(404).json({ error: "User not found" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.email, email));

    console.log("Password updated successfully");
    res.status(200).json({ message: "Password updated successfully" });
  } catch (error: any) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
