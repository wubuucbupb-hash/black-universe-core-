import { Router } from "express";
import type { Request, Response } from "express";
import { db, matrixAccountsTable, matrixTransactionsTable, usersTable } from "@workspace/db";
import { eq, desc, isNull, or } from "drizzle-orm";
import {
  FOUNDER_ACCOUNT,
  GROWTH_ACCOUNT,
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

// Returns the logged-in user, or null after sending a 401. Lets any
// authenticated citizen call an endpoint (not just admins).
async function getAuthUser(req: Request, res: Response) {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return user;
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
    .where(isNull(matrixAccountsTable.archivedAt))
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

// ── GET /api/matrix/my-transactions ────────────────────────────────────────
// The logged-in citizen's own transfer history (where they are the sender or
// receiver). Powers the user-facing activity panel.
router.get("/matrix/my-transactions", async (req, res): Promise<void> => {
  const user = await getAuthUser(req, res);
  if (!user) return;
  if (!user.accountNumber) {
    res.json({ accountNumber: null, transactions: [] });
    return;
  }
  const transactions = await db
    .select()
    .from(matrixTransactionsTable)
    .where(
      or(
        eq(matrixTransactionsTable.fromAccount, user.accountNumber),
        eq(matrixTransactionsTable.toAccount, user.accountNumber),
      ),
    )
    .orderBy(desc(matrixTransactionsTable.createdAt))
    .limit(50);
  res.json({ accountNumber: user.accountNumber, transactions });
});

// ── POST /api/matrix/mint ──────────────────────────────────────────────────
// Founder (admin role) only — locked to account 111111111111
router.post("/matrix/mint", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  try {
    const { inrValue, assetTitle } = req.body;

    if (!inrValue || Number(inrValue) <= 0 || !assetTitle?.trim()) {
      res.status(400).json({ error: "INR value and asset title are required" });
      return;
    }

    // System mint: the growth share routes to the Growth Pool so the Founder
    // always receives exactly 1% (never doubled via a user-selected target).
    const { gravityTotal, splits } = await mintGravity({
      inrValue: Number(inrValue),
      assetTitle: String(assetTitle),
      targetWallet: GROWTH_ACCOUNT,
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
  const user = await getAuthUser(req, res);
  if (!user) return;

  try {
    const { receiverAccount, amount } = req.body;
    // Non-admin citizens may only send from their own linked wallet; any
    // body-supplied senderAccount is ignored for them. Admins may pass one.
    let senderAccount: string | undefined = req.body.senderAccount;
    if (user.role !== "admin") {
      if (!user.accountNumber) {
        res.status(403).json({ error: "No wallet linked to your account" });
        return;
      }
      senderAccount = user.accountNumber;
    }

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
