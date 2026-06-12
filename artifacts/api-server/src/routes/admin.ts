import { Router } from "express";
import type { Request, Response } from "express";
import { db, assetsTable, usersTable, custodyLedgerTable } from "@workspace/db";
import { eq, sql, and, isNull } from "drizzle-orm";
import {
  AdminListAssetsQueryParams,
  RejectAssetBody,
} from "@workspace/api-zod";
import { mintGravity, ensureUserMatrixAccount } from "../lib/matrixEngine";
import { encrypt } from "../lib/encryption";

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
      mintedAt: assetsTable.mintedAt,
      gravityIssued: assetsTable.gravityIssued,
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
      gravityIssued: r.gravityIssued != null ? parseFloat(r.gravityIssued) : null,
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

// ── Deposit / Mint (second verification) ───────────────────────────────────
// Only available on already-approved assets that have not yet been minted.
// Issues gravity to the owner's Matrix account and locks a custody ledger entry.
router.post("/admin/assets/:id/deposit", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);

  // Pre-flight checks for clear error messages. The authoritative guard against
  // double-issuance is the atomic claim inside the transaction below.
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.id, id))
    .limit(1);

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  if (asset.status !== "approved") {
    res.status(409).json({ error: "Asset must be approved before deposit" });
    return;
  }

  if (asset.mintedAt != null) {
    res.status(409).json({ error: "Asset has already been deposited" });
    return;
  }

  const [owner] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, asset.userId))
    .limit(1);

  if (!owner) {
    res.status(404).json({ error: "Asset owner not found" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Atomic claim: only one request can flip an approved, not-yet-minted
      // asset to minted. Concurrent/duplicate calls find no matching row.
      const [claimed] = await tx
        .update(assetsTable)
        .set({ mintedAt: new Date() })
        .where(
          and(
            eq(assetsTable.id, id),
            eq(assetsTable.status, "approved"),
            isNull(assetsTable.mintedAt),
          ),
        )
        .returning();

      // Lost the race (another request already claimed it).
      if (!claimed) return null;

      // Ensure the owner has a linked Matrix account to receive gravity.
      const targetWallet = await ensureUserMatrixAccount(owner, tx);

      const claimedValue = parseFloat(claimed.claimedValue);
      const { splits } = await mintGravity(
        {
          inrValue: claimedValue,
          assetTitle: claimed.description,
          targetWallet,
        },
        tx,
      );

      // The owner's share (growth) is what lands in their wallet.
      const gravityIssued = splits.growth;

      // Lock a custody ledger entry for the deposited asset (encrypted at rest).
      await tx.insert(custodyLedgerTable).values({
        ownerAccount: targetWallet,
        assetType: claimed.assetType,
        valuationEncrypted: encrypt(claimedValue.toString()),
        descriptionEncrypted: encrypt(claimed.description),
        status: "LOCKED",
      });

      const [updated] = await tx
        .update(assetsTable)
        .set({ gravityIssued: gravityIssued.toFixed(6) })
        .where(eq(assetsTable.id, id))
        .returning();

      return { updated, targetWallet, gravityIssued };
    });

    if (!result) {
      res.status(409).json({ error: "Asset has already been deposited" });
      return;
    }

    req.log.info(
      { assetId: id, targetWallet: result.targetWallet, gravityIssued: result.gravityIssued },
      "Asset deposited and gravity issued",
    );

    const { updated } = result;
    res.json({
      ...updated,
      claimedValue: parseFloat(updated.claimedValue),
      feeAmount:
        updated.feeAmount != null ? parseFloat(updated.feeAmount) : null,
      gravityIssued:
        updated.gravityIssued != null
          ? parseFloat(updated.gravityIssued)
          : null,
    });
  } catch (err) {
    req.log.error({ err, assetId: id }, "Deposit failed; transaction rolled back");
    res.status(500).json({ error: "Deposit failed" });
  }
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

// NOTE: The previously open `/admin/forgot-password` and `/forgot-password`
// routes were removed. They allowed anyone to reset any account's password by
// supplying only an email + new password (account takeover). Password resets now
// go through the token-based flow in `users.ts`
// (POST /users/forgot-password -> POST /users/reset-password).

export default router;
