import { Router } from "express";
import type { Request, Response } from "express";
import { db, matrixAccountsTable, matrixTransactionsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  FOUNDER_ACCOUNT,
  adjustBalance,
  logTx,
  mintGravity,
} from "../lib/matrixEngine";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = req.session?.userId;
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

// ── GET /api/matrix/accounts ───────────────────────────────────────────────
// Public pool/citizen view. Returns only non-sensitive fields — contact PII
// (phone, email, nationalIdHash) is never exposed here.
router.get("/matrix/accounts", async (_req, res): Promise<void> => {
  const accounts = await db
    .select({
      accountNumber: matrixAccountsTable.accountNumber,
      name: matrixAccountsTable.name,
      type: matrixAccountsTable.type,
      cluster: matrixAccountsTable.cluster,
      gravityBalance: matrixAccountsTable.gravityBalance,
      createdAt: matrixAccountsTable.createdAt,
    })
    .from(matrixAccountsTable)
    .orderBy(matrixAccountsTable.accountNumber);
  res.json({ accounts });
});

// ── GET /api/matrix/logs ───────────────────────────────────────────────────
router.get("/matrix/logs", async (_req, res): Promise<void> => {
  const logs = await db
    .select()
    .from(matrixTransactionsTable)
    .orderBy(desc(matrixTransactionsTable.createdAt))
    .limit(50);
  res.json({ logs });
});

// ── POST /api/matrix/mint ──────────────────────────────────────────────────
// Founder (admin role) only — locked to account 111111111111
router.post("/matrix/mint", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  try {
    const { inrValue, assetTitle, targetWallet } = req.body;

    if (!inrValue || Number(inrValue) <= 0 || !assetTitle?.trim() || !targetWallet) {
      res.status(400).json({ error: "INR value, asset title and target wallet are required" });
      return;
    }

    const { gravityTotal, splits } = await mintGravity({
      inrValue: Number(inrValue),
      assetTitle: String(assetTitle),
      targetWallet: String(targetWallet),
    });

    res.json({ success: true, gravityTotal, splits });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Mint failed";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/matrix/transfer ──────────────────────────────────────────────
// P2P transfer — 1% tax to Founder, 99% to receiver
router.post("/matrix/transfer", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  try {
    const { senderAccount, receiverAccount, amount } = req.body;

    if (!senderAccount || !receiverAccount || !amount || Number(amount) <= 0) {
      res.status(400).json({ error: "Sender, receiver and amount are required" });
      return;
    }

    if (senderAccount === receiverAccount) {
      res.status(400).json({ error: "Sender and receiver cannot be the same" });
      return;
    }

    const [sender] = await db
      .select()
      .from(matrixAccountsTable)
      .where(eq(matrixAccountsTable.accountNumber, senderAccount))
      .limit(1);

    if (!sender) {
      res.status(404).json({ error: "Sender account not found" });
      return;
    }

    const senderBalance = Number(sender.gravityBalance);
    const txAmount = Number(amount);

    if (senderBalance < txAmount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const tax = txAmount * 0.01;
    const netTransfer = txAmount - tax;

    await adjustBalance(senderAccount, (-txAmount).toFixed(6));
    await adjustBalance(receiverAccount, netTransfer.toFixed(6));
    await adjustBalance(FOUNDER_ACCOUNT, tax.toFixed(6));

    await logTx("P2P_TRANSFER", `💸 [P2P TX] ${sender.name} → ${receiverAccount}: ${txAmount.toFixed(2)} Gravity`, senderAccount, receiverAccount, txAmount.toFixed(6));
    await logTx("P2P_TRANSFER", `🔥 [TAX] 1% (${tax.toFixed(2)} Gravity) → Founder Account`, senderAccount, FOUNDER_ACCOUNT, tax.toFixed(6));

    res.json({ success: true, sent: txAmount, received: netTransfer, tax });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Transfer failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
