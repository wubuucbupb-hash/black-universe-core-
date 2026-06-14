import { Router } from "express";
import type { Request, Response } from "express";
import {
  db,
  assetsTable,
  usersTable,
  custodyLedgerTable,
  matrixAccountsTable,
  matrixTransactionsTable,
  passwordResetTokensTable,
} from "@workspace/db";
import { eq, sql, and, isNull } from "drizzle-orm";
import {
  AdminListAssetsQueryParams,
  RejectAssetBody,
} from "@workspace/api-zod";
import {
  mintGravity,
  ensureUserMatrixAccount,
  adjustBalance,
  logTx,
} from "../lib/matrixEngine";
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

// Permanently delete a single asset submission from the registry.
// Blocked for minted assets because their gravity is already in circulation.
router.delete("/admin/assets/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid asset id" });
    return;
  }

  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.id, id))
    .limit(1);

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  if (asset.mintedAt != null) {
    res.status(409).json({
      error:
        "Cannot delete a minted asset; its gravity is already in circulation",
    });
    return;
  }

  await db.delete(assetsTable).where(eq(assetsTable.id, id));

  req.log.info({ assetId: id }, "Admin deleted asset");
  res.json({ success: true });
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
      archivedAt: u.archivedAt,
      assetCount: userAssets.length,
      totalClaimedValue: userAssets.reduce(
        (s, a) => s + parseFloat(a.claimedValue),
        0,
      ),
    };
  });

  res.json(result);
});

// ── User & Citizen management ──────────────────────────────────────────────
// Two kinds of removal:
//  • Hard delete (permanent): for test/junk records. Cascades to the owner's
//    assets, password-reset tokens, custody entries, and linked Matrix account.
//  • Archive (soft delete): for real users. Sets archivedAt so the record drops
//    out of every active/public view but the row (and its data) stays in the DB
//    and can be restored. System core accounts and admin users are protected.

const SYSTEM_CORES = [
  "000000000000",
  "111111111111",
  "222222222222",
  "333333333333",
  "444444444444",
  "555555555555",
  "666666666666",
  "777777777777",
  "888888888888",
  "999999999999",
];

// Admin view of every Matrix account, including archived ones (so they can be
// restored). The public /matrix/accounts endpoint hides archived accounts.
router.get("/admin/accounts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const accounts = await db
    .select({
      accountNumber: matrixAccountsTable.accountNumber,
      name: matrixAccountsTable.name,
      type: matrixAccountsTable.type,
      cluster: matrixAccountsTable.cluster,
      gravityBalance: matrixAccountsTable.gravityBalance,
      createdAt: matrixAccountsTable.createdAt,
      archivedAt: matrixAccountsTable.archivedAt,
    })
    .from(matrixAccountsTable)
    .orderBy(matrixAccountsTable.accountNumber);

  res.json({ accounts });
});

// Permanently delete a Matrix account and everything tied to it.
router.delete(
  "/admin/accounts/:accountNumber",
  async (req, res): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const accountNumber = req.params.accountNumber;
    if (SYSTEM_CORES.includes(accountNumber)) {
      res.status(403).json({ error: "Cannot delete a system core account" });
      return;
    }

    const [target] = await db
      .select()
      .from(matrixAccountsTable)
      .where(eq(matrixAccountsTable.accountNumber, accountNumber))
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const [linkedAdmin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.accountNumber, accountNumber),
          eq(usersTable.role, "admin"),
        ),
      )
      .limit(1);
    if (linkedAdmin) {
      res
        .status(403)
        .json({ error: "Cannot delete an account linked to an admin" });
      return;
    }

    await db.transaction(async (tx) => {
      const linkedUsers = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.accountNumber, accountNumber));

      for (const u of linkedUsers) {
        if (u.role === "admin") continue; // never remove an admin
        await tx
          .delete(passwordResetTokensTable)
          .where(eq(passwordResetTokensTable.userId, u.id));
        await tx.delete(assetsTable).where(eq(assetsTable.userId, u.id));
        await tx.delete(usersTable).where(eq(usersTable.id, u.id));
      }

      await tx
        .delete(custodyLedgerTable)
        .where(eq(custodyLedgerTable.ownerAccount, accountNumber));
      await tx
        .delete(matrixAccountsTable)
        .where(eq(matrixAccountsTable.accountNumber, accountNumber));
    });

    req.log.info({ accountNumber }, "Admin permanently deleted Matrix account");
    res.json({ ok: true });
  },
);

// Archive (soft delete) a Matrix account and any linked non-admin users.
router.post(
  "/admin/accounts/:accountNumber/archive",
  async (req, res): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const accountNumber = req.params.accountNumber;
    if (SYSTEM_CORES.includes(accountNumber)) {
      res.status(403).json({ error: "Cannot archive a system core account" });
      return;
    }

    const [target] = await db
      .select()
      .from(matrixAccountsTable)
      .where(eq(matrixAccountsTable.accountNumber, accountNumber))
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const [linkedAdmin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.accountNumber, accountNumber),
          eq(usersTable.role, "admin"),
        ),
      )
      .limit(1);
    if (linkedAdmin) {
      res
        .status(403)
        .json({ error: "Cannot archive an account linked to an admin" });
      return;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(matrixAccountsTable)
        .set({ archivedAt: now })
        .where(eq(matrixAccountsTable.accountNumber, accountNumber));
      await tx
        .update(usersTable)
        .set({ archivedAt: now })
        .where(
          and(
            eq(usersTable.accountNumber, accountNumber),
            sql`${usersTable.role} is distinct from 'admin'`,
          ),
        );
    });

    req.log.info({ accountNumber }, "Admin archived Matrix account");
    res.json({ ok: true });
  },
);

// Restore an archived Matrix account and any linked users.
router.post(
  "/admin/accounts/:accountNumber/restore",
  async (req, res): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const accountNumber = req.params.accountNumber;
    const [target] = await db
      .select()
      .from(matrixAccountsTable)
      .where(eq(matrixAccountsTable.accountNumber, accountNumber))
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(matrixAccountsTable)
        .set({ archivedAt: null })
        .where(eq(matrixAccountsTable.accountNumber, accountNumber));
      await tx
        .update(usersTable)
        .set({ archivedAt: null })
        .where(eq(usersTable.accountNumber, accountNumber));
    });

    req.log.info({ accountNumber }, "Admin restored Matrix account");
    res.json({ ok: true });
  },
);

// Permanently delete a portal user and everything tied to it.
router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.role === "admin") {
    res.status(403).json({ error: "Cannot delete an admin account" });
    return;
  }
  if (id === req.session.userId) {
    res.status(403).json({ error: "Cannot delete your own account" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, id));
    await tx.delete(assetsTable).where(eq(assetsTable.userId, id));
    if (
      target.accountNumber &&
      !SYSTEM_CORES.includes(target.accountNumber)
    ) {
      await tx
        .delete(custodyLedgerTable)
        .where(eq(custodyLedgerTable.ownerAccount, target.accountNumber));
      await tx
        .delete(matrixAccountsTable)
        .where(eq(matrixAccountsTable.accountNumber, target.accountNumber));
    }
    await tx.delete(usersTable).where(eq(usersTable.id, id));
  });

  req.log.info({ userId: id }, "Admin permanently deleted user");
  res.json({ ok: true });
});

// Archive (soft delete) a portal user and any linked Matrix account.
router.post("/admin/users/:id/archive", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.role === "admin") {
    res.status(403).json({ error: "Cannot archive an admin account" });
    return;
  }
  if (id === req.session.userId) {
    res.status(403).json({ error: "Cannot archive your own account" });
    return;
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ archivedAt: now })
      .where(eq(usersTable.id, id));
    if (
      target.accountNumber &&
      !SYSTEM_CORES.includes(target.accountNumber)
    ) {
      await tx
        .update(matrixAccountsTable)
        .set({ archivedAt: now })
        .where(eq(matrixAccountsTable.accountNumber, target.accountNumber));
    }
  });

  req.log.info({ userId: id }, "Admin archived user");
  res.json({ ok: true });
});

// Restore an archived portal user and any linked Matrix account.
router.post("/admin/users/:id/restore", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ archivedAt: null })
      .where(eq(usersTable.id, id));
    if (target.accountNumber) {
      await tx
        .update(matrixAccountsTable)
        .set({ archivedAt: null })
        .where(eq(matrixAccountsTable.accountNumber, target.accountNumber));
    }
  });

  req.log.info({ userId: id }, "Admin restored user");
  res.json({ ok: true });
});

// ── POST /admin/transactions/:id/reverse ───────────────────────────────────
// Admin-only. Reverses a recorded Matrix transaction by moving the gravity back
// exactly as the row recorded it: credit the original payer (fromAccount), debit
// the original payee (toAccount). The original row is marked `reversedAt` so it
// can't be reversed twice, and a REVERSAL row is appended for the audit trail.
//
// This faithfully inverts the recorded from/to/amount of THAT row. Composite
// system events (e.g. a MINT, which credits several pools) only log part of the
// movement per row, so reversing one row undoes only what that row recorded —
// the admin reverses each related row separately.
router.post(
  "/admin/transactions/:id/reverse",
  async (req, res): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid transaction id" });
      return;
    }

    const [tx] = await db
      .select()
      .from(matrixTransactionsTable)
      .where(eq(matrixTransactionsTable.id, id))
      .limit(1);

    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    if (tx.reversedAt) {
      res.status(400).json({ error: "Transaction already reversed" });
      return;
    }
    if (tx.txType === "REVERSAL") {
      res.status(400).json({ error: "A reversal cannot itself be reversed" });
      return;
    }

    const amount = Number(tx.amount);
    if (!tx.amount || !Number.isFinite(amount) || amount <= 0) {
      res
        .status(400)
        .json({ error: "This transaction has no gravity movement to reverse" });
      return;
    }

    await db.transaction(async (dbtx) => {
      // Inverse of the recorded row. Accounts that no longer exist simply match
      // no rows (safe no-op).
      if (tx.fromAccount) {
        await adjustBalance(tx.fromAccount, amount.toFixed(6), dbtx);
      }
      if (tx.toAccount) {
        await adjustBalance(tx.toAccount, (-amount).toFixed(6), dbtx);
      }
      await dbtx
        .update(matrixTransactionsTable)
        .set({ reversedAt: new Date() })
        .where(eq(matrixTransactionsTable.id, id));
      await logTx(
        "REVERSAL",
        `↩️ [REVERSAL] Tx #${tx.id} (${tx.txType}) reversed by admin — ${amount.toFixed(2)} Gravity returned`,
        tx.toAccount ?? undefined,
        tx.fromAccount ?? undefined,
        amount.toFixed(6),
        dbtx,
      );
    });

    req.log.info({ txId: id }, "Admin reversed transaction");
    res.json({ ok: true });
  },
);

// NOTE: The previously open `/admin/forgot-password` and `/forgot-password`
// routes were removed. They allowed anyone to reset any account's password by
// supplying only an email + new password (account takeover). Password resets now
// go through the token-based flow in `users.ts`
// (POST /users/forgot-password -> POST /users/reset-password).

export default router;
