import { Router } from "express";
import type { Request, Response } from "express";
import { db, assetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { SubmitAssetBody } from "@workspace/api-zod";

const router = Router();

function requireAuth(req: Request, res: Response): number | null {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

router.get("/assets/summary", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const assets = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.userId, userId));

  const totalSubmitted = assets.length;
  const totalApproved = assets.filter((a) => a.status === "approved").length;
  const totalPending = assets.filter((a) => a.status === "pending").length;
  const totalRejected = assets.filter((a) => a.status === "rejected").length;
  const totalClaimedValue = assets.reduce((s, a) => s + parseFloat(a.claimedValue), 0);
  const totalApprovedValue = assets
    .filter((a) => a.status === "approved")
    .reduce((s, a) => s + parseFloat(a.claimedValue), 0);

  res.json({
    totalSubmitted,
    totalApproved,
    totalPending,
    totalRejected,
    totalClaimedValue,
    totalApprovedValue,
  });
});

router.get("/assets", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const assets = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.userId, userId))
    .orderBy(assetsTable.createdAt);

  res.json(
    assets.map((a) => ({
      ...a,
      claimedValue: parseFloat(a.claimedValue),
      feeAmount: a.feeAmount != null ? parseFloat(a.feeAmount) : null,
    }))
  );
});

router.post("/assets", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = SubmitAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { assetType, claimedValue, description, documentNote } = parsed.data;

  const [asset] = await db
    .insert(assetsTable)
    .values({
      userId,
      assetType,
      claimedValue: claimedValue.toString(),
      description,
      documentNote: documentNote ?? null,
      status: "pending",
    })
    .returning();

  res.status(201).json({
    ...asset,
    claimedValue: parseFloat(asset.claimedValue),
    feeAmount: asset.feeAmount != null ? parseFloat(asset.feeAmount) : null,
  });
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id);
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(and(eq(assetsTable.id, id), eq(assetsTable.userId, userId)))
    .limit(1);

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json({
    ...asset,
    claimedValue: parseFloat(asset.claimedValue),
    feeAmount: asset.feeAmount != null ? parseFloat(asset.feeAmount) : null,
  });
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const id = parseInt(req.params.id);
  const [existing] = await db
    .select()
    .from(assetsTable)
    .where(and(eq(assetsTable.id, id), eq(assetsTable.userId, userId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  await db.delete(assetsTable).where(eq(assetsTable.id, id));
  res.json({ message: "Asset deleted" });
});

export default router;
