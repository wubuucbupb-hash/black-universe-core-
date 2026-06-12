import { Router } from "express";
import type { Request, Response } from "express";
import { db, assetsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  AdminListAssetsQueryParams,
  RejectAssetBody,
} from "@workspace/api-zod";
import bcrypt from "bcrypt";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

router.get("/admin/assets", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const queryParsed = AdminListAssetsQueryParams.safeParse(req.query);
  const statusFilter = queryParsed.success
    ? queryParsed.data.status
    : undefined;

  const rows = await db
    .select({
      id: assetsTable.id,
      userId: assetsTable.userId,
      assetType: assetsTable.assetType,
      claimedValue: assetsTable.claimedValue,
      description: assetsTable.description,
      documentNote: assetsTable.documentNote,
      documentUrls: assetsTable.documentUrls,
      status: assetsTable.status,
      feeAmount: assetsTable.feeAmount,
      rejectionReason: assetsTable.rejectionReason,
      createdAt: assetsTable.createdAt,
      updatedAt: assetsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(assetsTable)
    .innerJoin(usersTable, eq(assetsTable.userId, usersTable.id))
    .orderBy(assetsTable.createdAt);

  const filtered = statusFilter
    ? rows.filter((r) => r.status === statusFilter)
    : rows;

  res.json(
    filtered.map((r) => ({
      ...r,
      claimedValue: parseFloat(r.claimedValue),
      feeAmount: r.feeAmount != null ? parseFloat(r.feeAmount) : null,
    })),
  );
});

router.post("/admin/assets/:id/approve", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.id, id))
    .limit(1);

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const claimedValue = parseFloat(asset.claimedValue);
  const feeAmount = claimedValue * 0.01;

  const [updated] = await db
    .update(assetsTable)
    .set({ status: "approved", feeAmount: feeAmount.toString() })
    .where(eq(assetsTable.id, id))
    .returning();

  res.json({
    ...updated,
    claimedValue: parseFloat(updated.claimedValue),
    feeAmount: parseFloat(updated.feeAmount!),
  });
});

router.post("/admin/assets/:id/reject", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);
  const parsed = RejectAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(assetsTable)
    .set({ status: "rejected", rejectionReason: parsed.data.reason })
    .where(eq(assetsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json({
    ...updated,
    claimedValue: parseFloat(updated.claimedValue),
    feeAmount: updated.feeAmount != null ? parseFloat(updated.feeAmount) : null,
  });
});

router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const allAssets = await db.select().from(assetsTable);
  const [{ count: totalUsers }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(usersTable);

  const totalAssets = allAssets.length;
  const pendingAssets = allAssets.filter((a) => a.status === "pending").length;
  const approvedAssets = allAssets.filter(
    (a) => a.status === "approved",
  ).length;
  const rejectedAssets = allAssets.filter(
    (a) => a.status === "rejected",
  ).length;
  const totalFeesEarned = allAssets
    .filter((a) => a.feeAmount != null)
    .reduce((s, a) => s + parseFloat(a.feeAmount!), 0);
  const totalVerifiedValue = allAssets
    .filter((a) => a.status === "approved")
    .reduce((s, a) => s + parseFloat(a.claimedValue), 0);

  res.json({
    totalUsers: Number(totalUsers),
    totalAssets,
    pendingAssets,
    approvedAssets,
    rejectedAssets,
    totalFeesEarned,
    totalVerifiedValue,
  });
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const users = await db
    .select()
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  const assets = await db.select().from(assetsTable);

  const result = users.map((u) => {
    const userAssets = assets.filter((a) => a.userId === u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      assetCount: userAssets.length,
      totalClaimedValue: userAssets.reduce(
        (s, a) => s + parseFloat(a.claimedValue),
        0,
      ),
    };
  });

  res.json(result);
});

// 🔥 SAFETY ROUTE: Frontend chahe kisi bhi route par bhatke, ye sabke liye password badal dega 🔥
router.post("/admin/forgot-password", async (req, res): Promise<void> => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      res.status(400).json({ error: "Email and new password are required" });
      return;
    }

    const [userFound] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!userFound) {
      res
        .status(404)
        .json({ error: "This email is not registered in the database" });
      return;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(usersTable)
      .set({ passwordHash: newPasswordHash })
      .where(eq(usersTable.email, email));

    res.json({ message: "Password updated successfully!" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// Kuch systems standard authentication route ko fallback bana dete hain, unke liye backup:
router.post("/forgot-password", async (req, res): Promise<void> => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      res.status(400).json({ error: "Email and new password are required" });
      return;
    }
    const [userFound] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!userFound) {
      res.status(404).json({ error: "This email is not registered" });
      return;
    }
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(usersTable)
      .set({ passwordHash: newPasswordHash })
      .where(eq(usersTable.email, email));
    res.json({ message: "Password updated successfully!" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

export default router;
