import { Router } from "express";
import { db, custodyLedgerTable, matrixAccountsTable, matrixTransactionsTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";

const router = Router();
const FOUNDER_ACCOUNT = "111111111111";

function requireSession(req: any, res: any): boolean {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

async function isFounder(userId: number): Promise<boolean> {
  const { usersTable } = await import("@workspace/db");
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user?.role === "admin";
}

// ── GET /api/custody/summary ───────────────────────────────────────────────
// Any logged-in user — returns counts and total locked (no sensitive data)
router.get("/custody/summary", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  const entries = await db
    .select({ id: custodyLedgerTable.id, status: custodyLedgerTable.status, valuationEncrypted: custodyLedgerTable.valuationEncrypted })
    .from(custodyLedgerTable);

  const locked = entries.filter((e) => e.status === "LOCKED");
  const pending = entries.filter((e) => e.status === "PENDING");
  const released = entries.filter((e) => e.status === "RELEASED");

  let totalLockedValue = 0;
  for (const e of locked) {
    try {
      totalLockedValue += parseFloat(decrypt(e.valuationEncrypted)) || 0;
    } catch {}
  }

  res.json({
    total: entries.length,
    locked: locked.length,
    pending: pending.length,
    released: released.length,
    totalLockedValue,
  });
});

// ── GET /api/custody/vault ─────────────────────────────────────────────────
// Founder ONLY — full decrypted vault view
router.get("/custody/vault", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  const founder = await isFounder(req.session!.userId!);
  if (!founder) {
    res.status(403).json({ error: "Founder Root access required" });
    return;
  }

  const entries = await db
    .select()
    .from(custodyLedgerTable)
    .orderBy(custodyLedgerTable.createdAt);

  const decrypted = entries.map((e) => ({
    id: e.id,
    ownerAccount: e.ownerAccount,
    assetType: e.assetType,
    valuation: decrypt(e.valuationEncrypted),
    description: decrypt(e.descriptionEncrypted),
    escrowAmount: e.escrowAmountEncrypted ? decrypt(e.escrowAmountEncrypted) : null,
    escrowFromAccount: e.escrowFromAccount,
    escrowToAccount: e.escrowToAccount,
    status: e.status,
    releasedAt: e.releasedAt,
    createdAt: e.createdAt,
  }));

  res.json({ entries: decrypted });
});

// ── POST /api/custody/lock ─────────────────────────────────────────────────
// Lock an asset manually into custody (LOCKED state)
router.post("/custody/lock", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  try {
    const { ownerAccount, assetType, valuation, description } = req.body;

    if (!ownerAccount || !assetType || !valuation || !description) {
      res.status(400).json({ error: "ownerAccount, assetType, valuation and description are required" });
      return;
    }

    const [entry] = await db.insert(custodyLedgerTable).values({
      ownerAccount,
      assetType,
      valuationEncrypted: encrypt(String(valuation)),
      descriptionEncrypted: encrypt(description),
      status: "LOCKED",
    }).returning({ id: custodyLedgerTable.id, status: custodyLedgerTable.status, createdAt: custodyLedgerTable.createdAt });

    res.status(201).json({ entry });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Lock failed" });
  }
});

// ── POST /api/custody/release/:id ─────────────────────────────────────────
// Founder ONLY — release escrow, credit receiver, mark RELEASED
router.post("/custody/release/:id", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  const founder = await isFounder(req.session!.userId!);
  if (!founder) {
    res.status(403).json({ error: "Founder Root access required" });
    return;
  }

  try {
    const entryId = Number(req.params.id);
    const [entry] = await db
      .select()
      .from(custodyLedgerTable)
      .where(eq(custodyLedgerTable.id, entryId))
      .limit(1);

    if (!entry) {
      res.status(404).json({ error: "Custody entry not found" });
      return;
    }

    if (entry.status !== "LOCKED") {
      res.status(400).json({ error: `Cannot release entry with status: ${entry.status}` });
      return;
    }

    // If this is an escrow P2P transfer, complete the receiver credit now
    if (entry.escrowToAccount && entry.escrowAmountEncrypted) {
      const amount = parseFloat(decrypt(entry.escrowAmountEncrypted));
      const tax = amount * 0.01;
      const netTransfer = amount - tax;

      await db
        .update(matrixAccountsTable)
        .set({ gravityBalance: sql`${matrixAccountsTable.gravityBalance} + ${netTransfer.toFixed(6)}` })
        .where(eq(matrixAccountsTable.accountNumber, entry.escrowToAccount));

      await db
        .update(matrixAccountsTable)
        .set({ gravityBalance: sql`${matrixAccountsTable.gravityBalance} + ${tax.toFixed(6)}` })
        .where(eq(matrixAccountsTable.accountNumber, FOUNDER_ACCOUNT));

      await db.insert(matrixTransactionsTable).values({
        txType: "ESCROW_RELEASE",
        description: `🔓 [ESCROW RELEASED] ${entry.escrowFromAccount} → ${entry.escrowToAccount}: ${amount.toFixed(2)} Gravity`,
        fromAccount: entry.escrowFromAccount,
        toAccount: entry.escrowToAccount,
        amount: amount.toFixed(6),
      });
    }

    await db
      .update(custodyLedgerTable)
      .set({ status: "RELEASED", releasedAt: new Date(), updatedAt: new Date() })
      .where(eq(custodyLedgerTable.id, entryId));

    res.json({ success: true, message: "Custody entry released" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Release failed" });
  }
});

// ── POST /api/custody/escrow ───────────────────────────────────────────────
// Initiate a P2P escrow transfer — deducts sender, creates LOCKED entry
// Receiver is credited only after Founder calls /release/:id
router.post("/custody/escrow", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  try {
    const { senderAccount, receiverAccount, amount, description } = req.body;

    if (!senderAccount || !receiverAccount || !amount || Number(amount) <= 0) {
      res.status(400).json({ error: "senderAccount, receiverAccount and amount are required" });
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

    const txAmount = Number(amount);
    if (parseFloat(String(sender.gravityBalance)) < txAmount) {
      res.status(400).json({ error: "Insufficient balance for escrow" });
      return;
    }

    // Deduct from sender immediately — funds locked in escrow
    await db
      .update(matrixAccountsTable)
      .set({ gravityBalance: sql`${matrixAccountsTable.gravityBalance} - ${txAmount.toFixed(6)}` })
      .where(eq(matrixAccountsTable.accountNumber, senderAccount));

    // Create LOCKED custody entry
    const [entry] = await db.insert(custodyLedgerTable).values({
      ownerAccount: senderAccount,
      assetType: "P2P_ESCROW",
      valuationEncrypted: encrypt(txAmount.toFixed(6)),
      descriptionEncrypted: encrypt(description ?? `P2P Transfer: ${senderAccount} → ${receiverAccount}`),
      escrowAmountEncrypted: encrypt(txAmount.toFixed(6)),
      escrowFromAccount: senderAccount,
      escrowToAccount: receiverAccount,
      status: "LOCKED",
    }).returning();

    await db.insert(matrixTransactionsTable).values({
      txType: "ESCROW_LOCK",
      description: `🔒 [ESCROW LOCKED] ${sender.name} → ${receiverAccount}: ${txAmount.toFixed(2)} Gravity (awaiting Founder release)`,
      fromAccount: senderAccount,
      toAccount: receiverAccount,
      amount: txAmount.toFixed(6),
    });

    res.status(201).json({
      success: true,
      custodyId: entry.id,
      status: "LOCKED",
      message: "Funds locked in escrow. Awaiting Founder release.",
      amount: txAmount,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Escrow failed" });
  }
});

export default router;
