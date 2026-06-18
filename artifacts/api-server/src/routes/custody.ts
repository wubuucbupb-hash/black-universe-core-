import { Router } from "express";
import { db, custodyLedgerTable, matrixAccountsTable, matrixTransactionsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";
import {
  adjustBalance,
  recordPoolFee,
  logTx,
  USERS_VAULT,
  GRAVITY_RATE,
} from "../lib/matrixEngine";

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

// ── GET /api/custody/mine ──────────────────────────────────────────────────
// Any logged-in user — returns ONLY the caller's own vault: custody entries
// they own or are an escrow party to, decrypted (it's their own data), plus a
// summary scoped to just those entries. External users never see other people's
// or system-wide vault data here.
router.get("/custody/mine", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  const userId = req.session!.userId!;
  const { usersTable } = await import("@workspace/db");
  const [u] = await db
    .select({ accountNumber: usersTable.accountNumber })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const acct = u?.accountNumber;
  const empty = { total: 0, locked: 0, pending: 0, released: 0, totalLockedValue: 0 };
  if (!acct) {
    res.json({ accountNumber: null, entries: [], summary: empty });
    return;
  }

  const rows = await db
    .select()
    .from(custodyLedgerTable)
    .where(
      or(
        eq(custodyLedgerTable.ownerAccount, acct),
        eq(custodyLedgerTable.escrowFromAccount, acct),
        eq(custodyLedgerTable.escrowToAccount, acct),
      ),
    )
    .orderBy(custodyLedgerTable.createdAt);

  const entries = rows.map((e) => ({
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

  const locked = entries.filter((e) => e.status === "LOCKED");
  let totalLockedValue = 0;
  for (const e of locked) {
    totalLockedValue += parseFloat(e.valuation) || 0;
  }

  res.json({
    accountNumber: acct,
    entries,
    summary: {
      total: entries.length,
      locked: locked.length,
      pending: entries.filter((e) => e.status === "PENDING").length,
      released: entries.filter((e) => e.status === "RELEASED").length,
      totalLockedValue,
    },
  });
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

    const inrValue = Number(valuation);
    if (!Number.isFinite(inrValue) || inrValue <= 0) {
      res.status(400).json({ error: "A positive valuation is required" });
      return;
    }
    const backingGravity = inrValue / GRAVITY_RATE;

    // Locking a USER asset records its Gravity value in the USERS VAULT (a pool
    // kept STRUCTURALLY SEPARATE from the System Vault — visible + counted in the
    // Total Vault but NEVER backs minting) AND issues that same Gravity straight
    // to the owner's own account (collateral tokenisation). Insert + Users-Vault
    // bump + owner credit all run atomically. The System Vault and mint gate are
    // never touched.
    const entry = await db.transaction(async (tx) => {
      const [row] = await tx.insert(custodyLedgerTable).values({
        ownerAccount,
        assetType,
        valuationEncrypted: encrypt(String(valuation)),
        descriptionEncrypted: encrypt(description),
        status: "LOCKED",
      }).returning({ id: custodyLedgerTable.id, status: custodyLedgerTable.status, createdAt: custodyLedgerTable.createdAt });

      await adjustBalance(USERS_VAULT, backingGravity.toFixed(6), tx);
      await logTx(
        "VAULT_LOCK",
        `👥 [USERS VAULT LOCK] ${assetType} locked by ${ownerAccount}: +${backingGravity.toFixed(2)} G (does NOT back minting)`,
        undefined,
        USERS_VAULT,
        backingGravity.toFixed(6),
        tx,
      );

      // Issue the locked asset's Gravity to the owner's own account.
      await adjustBalance(ownerAccount, backingGravity.toFixed(6), tx);
      await logTx(
        "CUSTODY_ISSUE",
        `🌌 [CUSTODY ISSUE] +${backingGravity.toFixed(2)} G issued to ${ownerAccount} for locked ${assetType}`,
        undefined,
        ownerAccount,
        backingGravity.toFixed(6),
        tx,
      );
      return row;
    });

    res.status(201).json({ entry });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Lock failed" });
  }
});

// ── POST /api/custody/revalue/:id ──────────────────────────────────────────
// Founder ONLY — correct the valuation (and optional description) of a custody
// entry. Moves the USERS VAULT by the delta; never touches the System Vault
// backing or the mint gate.
router.post("/custody/revalue/:id", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  const founder = await isFounder(req.session!.userId!);
  if (!founder) {
    res.status(403).json({ error: "Founder Root access required" });
    return;
  }

  try {
    const entryId = Number(req.params.id);
    const { valuation, description } = req.body;

    const newVal = Number(valuation);
    if (valuation == null || !Number.isFinite(newVal) || newVal <= 0) {
      res.status(400).json({ error: "A positive valuation is required" });
      return;
    }

    // Revaluation moves the USERS VAULT value by the delta (new − old): the asset
    // is now worth more (or less). The Users Vault never backs minting, so the
    // mint gate is unaffected. The row is locked FOR UPDATE so the value change
    // and the Users-Vault move stay consistent.
    const updated = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(custodyLedgerTable)
        .where(eq(custodyLedgerTable.id, entryId))
        .for("update");

      if (!entry) throw new Error("NOT_FOUND");
      if (entry.escrowFromAccount || entry.escrowToAccount) throw new Error("IS_ESCROW");
      if (entry.status !== "LOCKED") throw new Error(`NOT_LOCKED:${entry.status}`);

      const oldVal = parseFloat(decrypt(entry.valuationEncrypted)) || 0;
      const deltaGravity = (newVal - oldVal) / GRAVITY_RATE;

      const [row] = await tx
        .update(custodyLedgerTable)
        .set({
          valuationEncrypted: encrypt(String(valuation)),
          updatedAt: new Date(),
          ...(typeof description === "string" && description.trim()
            ? { descriptionEncrypted: encrypt(description) }
            : {}),
        })
        .where(eq(custodyLedgerTable.id, entryId))
        .returning();

      if (deltaGravity !== 0) {
        await adjustBalance(USERS_VAULT, deltaGravity.toFixed(6), tx);
        await logTx(
          "VAULT_REVALUE",
          `✏️ [USERS VAULT REVALUE] entry #${entryId}: ₹${oldVal.toFixed(2)} → ₹${newVal.toFixed(2)} (${deltaGravity >= 0 ? "+" : ""}${deltaGravity.toFixed(2)} G)`,
          undefined,
          USERS_VAULT,
          deltaGravity.toFixed(6),
          tx,
        );
      }

      return row;
    });

    res.json({
      entry: {
        id: updated.id,
        valuation: decrypt(updated.valuationEncrypted),
        description: decrypt(updated.descriptionEncrypted),
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Revaluation failed";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "Custody entry not found" });
    } else if (msg === "IS_ESCROW") {
      res.status(400).json({ error: "Cannot revalue an escrow entry" });
    } else if (msg.startsWith("NOT_LOCKED:")) {
      res.status(400).json({ error: `Cannot revalue entry with status: ${msg.slice("NOT_LOCKED:".length)}` });
    } else {
      res.status(500).json({ error: msg });
    }
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

    // P4: lock the custody row, credit the receiver, and flip the status to
    // RELEASED inside ONE atomic transaction. The FOR UPDATE lock means two
    // concurrent releases can't both credit the receiver (no double-credit),
    // and if any step fails the whole release rolls back.
    await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(custodyLedgerTable)
        .where(eq(custodyLedgerTable.id, entryId))
        .for("update");

      if (!entry) throw new Error("NOT_FOUND");
      if (entry.status !== "LOCKED") {
        throw new Error(`NOT_LOCKED:${entry.status}`);
      }

      // If this is an escrow P2P transfer, complete the receiver credit now.
      if (entry.escrowToAccount && entry.escrowAmountEncrypted) {
        const amount = parseFloat(decrypt(entry.escrowAmountEncrypted));
        const tax = amount * 0.01;
        const netTransfer = amount - tax;

        await adjustBalance(entry.escrowToAccount, netTransfer.toFixed(6), tx);
        // P3: Founder tax is batch-aggregated within the same transaction.
        await recordPoolFee(FOUNDER_ACCOUNT, tax.toFixed(6), "ESCROW_FEE", tx);

        await tx.insert(matrixTransactionsTable).values({
          txType: "ESCROW_RELEASE",
          description: `🔓 [ESCROW RELEASED] ${entry.escrowFromAccount} → ${entry.escrowToAccount}: ${amount.toFixed(2)} Gravity`,
          fromAccount: entry.escrowFromAccount,
          toAccount: entry.escrowToAccount,
          amount: amount.toFixed(6),
        });
      } else if (!entry.escrowFromAccount && !entry.escrowToAccount) {
        // Plain asset release — the asset leaves the Users Vault, so pull the
        // value it contributed back OUT (the exact mirror of the lock that added
        // it). The Users Vault never backed minting, so the mint gate stays
        // honest either way.
        const assetVal = parseFloat(decrypt(entry.valuationEncrypted)) || 0;
        const backingGravity = assetVal / GRAVITY_RATE;
        if (backingGravity > 0) {
          await adjustBalance(USERS_VAULT, (-backingGravity).toFixed(6), tx);
          await logTx(
            "VAULT_RELEASE",
            `🔓 [USERS VAULT RELEASE] entry #${entryId} (${entry.assetType}) released: -${backingGravity.toFixed(2)} G`,
            USERS_VAULT,
            undefined,
            backingGravity.toFixed(6),
            tx,
          );
        }
      }

      await tx
        .update(custodyLedgerTable)
        .set({ status: "RELEASED", releasedAt: new Date(), updatedAt: new Date() })
        .where(eq(custodyLedgerTable.id, entryId));
    });

    res.json({ success: true, message: "Custody entry released" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Release failed";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "Custody entry not found" });
    } else if (msg.startsWith("NOT_LOCKED:")) {
      res.status(400).json({
        error: `Cannot release entry with status: ${msg.slice("NOT_LOCKED:".length)}`,
      });
    } else {
      res.status(500).json({ error: msg });
    }
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

    const txAmount = Number(amount);

    // P1: lock the sender's wallet FOR UPDATE, check the floor, debit, and
    // create the LOCKED custody entry — all in one atomic transaction.
    const custodyId = await db.transaction(async (tx) => {
      const [sender] = await tx
        .select()
        .from(matrixAccountsTable)
        .where(eq(matrixAccountsTable.accountNumber, senderAccount))
        .for("update");
      if (!sender) throw new Error("SENDER_NOT_FOUND");

      // P2: strict floor of 0 — escrow can never push the wallet negative.
      if (Number(sender.gravityBalance) < txAmount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // Deduct from sender immediately — funds locked in escrow.
      await adjustBalance(senderAccount, (-txAmount).toFixed(6), tx);

      const [entry] = await tx
        .insert(custodyLedgerTable)
        .values({
          ownerAccount: senderAccount,
          assetType: "P2P_ESCROW",
          valuationEncrypted: encrypt(txAmount.toFixed(6)),
          descriptionEncrypted: encrypt(
            description ?? `P2P Transfer: ${senderAccount} → ${receiverAccount}`,
          ),
          escrowAmountEncrypted: encrypt(txAmount.toFixed(6)),
          escrowFromAccount: senderAccount,
          escrowToAccount: receiverAccount,
          status: "LOCKED",
        })
        .returning();

      await tx.insert(matrixTransactionsTable).values({
        txType: "ESCROW_LOCK",
        description: `🔒 [ESCROW LOCKED] ${sender.name} → ${receiverAccount}: ${txAmount.toFixed(2)} Gravity (awaiting Founder release)`,
        fromAccount: senderAccount,
        toAccount: receiverAccount,
        amount: txAmount.toFixed(6),
      });

      return entry.id;
    });

    res.status(201).json({
      success: true,
      custodyId,
      status: "LOCKED",
      message: "Funds locked in escrow. Awaiting Founder release.",
      amount: txAmount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Escrow failed";
    if (msg === "SENDER_NOT_FOUND") {
      res.status(404).json({ error: "Sender account not found" });
    } else if (msg === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance for escrow" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
