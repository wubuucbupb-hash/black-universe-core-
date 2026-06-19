import { Router } from "express";
import { db, custodyLedgerTable, matrixAccountsTable, matrixTransactionsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encryption";
import {
  adjustBalance,
  recordPoolFee,
  logTx,
  GROWTH_ACCOUNT,
  VAULT_ACCOUNT,
  GRAVITY_RATE,
} from "../lib/matrixEngine";

const router = Router();
const FOUNDER_ACCOUNT = "111111111111";

// The asset is NOT collateral. The Gravity a user is paid when their asset is
// locked is DRAWN from a system pool that already holds MINTED Gravity — never
// created from thin air. For normal user assets that pool is the Growth pool.
// (Other asset/value types can map to other pools later; only "normal" today.)
function sourcePoolFor(_assetType: string): string {
  return GROWTH_ACCOUNT;
}

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
    res.status(403).json({ error: "Foundation Root access required" });
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

  const founder = await isFounder(req.session!.userId!);
  if (!founder) {
    res.status(403).json({ error: "Foundation Root access required" });
    return;
  }

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
    const issuedGravity = inrValue / GRAVITY_RATE;

    // When the asset is locked the owner is PAID its Gravity value out of a
    // system pool that already holds minted Gravity (Growth pool for normal
    // assets). We lock that pool FOR UPDATE, enforce a strict 0-floor, debit it
    // and credit the owner — all atomically — so no Gravity is created from thin
    // air. The asset is NOT collateral; the System Vault, System Core and the
    // mint gate are never touched.
    const sourcePool = sourcePoolFor(assetType);
    const entry = await db.transaction(async (tx) => {
      const [pool] = await tx
        .select()
        .from(matrixAccountsTable)
        .where(eq(matrixAccountsTable.accountNumber, sourcePool))
        .for("update");
      if (!pool || Number(pool.gravityBalance) < issuedGravity) {
        throw new Error("INSUFFICIENT_POOL");
      }

      const [row] = await tx.insert(custodyLedgerTable).values({
        ownerAccount,
        assetType,
        valuationEncrypted: encrypt(String(valuation)),
        descriptionEncrypted: encrypt(description),
        status: "LOCKED",
      }).returning({ id: custodyLedgerTable.id, status: custodyLedgerTable.status, createdAt: custodyLedgerTable.createdAt });

      await adjustBalance(sourcePool, (-issuedGravity).toFixed(6), tx);
      await adjustBalance(ownerAccount, issuedGravity.toFixed(6), tx);
      await logTx(
        "CUSTODY_ISSUE",
        `🌌 [CUSTODY ISSUE] ${issuedGravity.toFixed(2)} G paid to ${ownerAccount} from Growth pool for locked ${assetType}`,
        sourcePool,
        ownerAccount,
        issuedGravity.toFixed(6),
        tx,
      );
      return row;
    });

    res.status(201).json({ entry });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lock failed";
    if (msg === "INSUFFICIENT_POOL") {
      res.status(400).json({
        error: "Growth pool has insufficient Gravity to issue for this asset. Mint / top up the Growth pool first.",
      });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/custody/revalue/:id ──────────────────────────────────────────
// Founder ONLY — correct the valuation (and optional description) of a custody
// entry. A higher value pays the extra Gravity to the owner from the Growth
// pool AND grows the System Vault backing by the same delta (the asset now backs
// more). A LOWER value only updates the recorded valuation — it NEVER claws
// Gravity back from the owner and NEVER shrinks the System Vault backing,
// because a fall in the asset's value does not depend on the owner (what was
// paid/backed stays). So both the owner payout and the Vault backing can only
// ever go UP on revalue, never down.
router.post("/custody/revalue/:id", async (req, res): Promise<void> => {
  if (!requireSession(req, res)) return;

  const founder = await isFounder(req.session!.userId!);
  if (!founder) {
    res.status(403).json({ error: "Foundation Root access required" });
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

    // Revaluation: if the asset is worth MORE, pay the extra Gravity to the owner
    // from the Growth pool AND grow the System Vault backing by the same delta.
    // If it is worth LESS, only the recorded valuation changes — no Gravity is
    // clawed back and the System Vault is NOT reduced (a value fall is not the
    // owner's doing). The row is locked FOR UPDATE so the value change and any
    // pool move stay consistent.
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

      if (deltaGravity > 0) {
        // Asset worth more — pay the extra Gravity to the owner from the pool.
        const pool = sourcePoolFor(entry.assetType);
        const [src] = await tx
          .select()
          .from(matrixAccountsTable)
          .where(eq(matrixAccountsTable.accountNumber, pool))
          .for("update");
        if (!src || Number(src.gravityBalance) < deltaGravity) {
          throw new Error("INSUFFICIENT_POOL");
        }
        await adjustBalance(pool, (-deltaGravity).toFixed(6), tx);
        await adjustBalance(entry.ownerAccount, deltaGravity.toFixed(6), tx);
        await logTx(
          "VAULT_REVALUE",
          `✏️ [REVALUE +] entry #${entryId}: ₹${oldVal.toFixed(2)} → ₹${newVal.toFixed(2)} (+${deltaGravity.toFixed(2)} G to ${entry.ownerAccount} from Growth pool)`,
          pool,
          entry.ownerAccount,
          deltaGravity.toFixed(6),
          tx,
        );
        // The asset now backs MORE — grow the System Vault backing by the same
        // delta (counted in Gravity, like admin approve; never minted here). The
        // Vault backing can only ever go up on revalue, never down.
        await adjustBalance(VAULT_ACCOUNT, deltaGravity.toFixed(6), tx);
        await logTx(
          "VAULT_REVALUE",
          `🏦 [REVALUE → VAULT] entry #${entryId}: +${deltaGravity.toFixed(2)} G added to System Vault backing (₹${oldVal.toFixed(2)} → ₹${newVal.toFixed(2)})`,
          undefined,
          VAULT_ACCOUNT,
          deltaGravity.toFixed(6),
          tx,
        );
      } else if (deltaGravity < 0) {
        // Asset worth less — only the recorded valuation is updated above. No
        // Gravity is clawed back from the owner: a fall in the asset's value
        // does not depend on the owner, so what was already paid stays theirs.
        await logTx(
          "VAULT_REVALUE",
          `✏️ [REVALUE −] entry #${entryId}: ₹${oldVal.toFixed(2)} → ₹${newVal.toFixed(2)} (valuation lowered; no Gravity clawed back from ${entry.ownerAccount})`,
          entry.ownerAccount,
          entry.ownerAccount,
          "0.000000",
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
    } else if (msg === "INSUFFICIENT_POOL") {
      res.status(400).json({ error: "Growth pool has insufficient Gravity for this revaluation." });
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
    res.status(403).json({ error: "Foundation Root access required" });
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
        // Plain asset release — the asset leaves custody, so the Gravity issued
        // to the owner when it was locked is clawed back to the Growth pool (the
        // exact mirror of the lock). The owner must still hold it.
        const assetVal = parseFloat(decrypt(entry.valuationEncrypted)) || 0;
        const issuedGravity = assetVal / GRAVITY_RATE;
        if (issuedGravity > 0) {
          const pool = sourcePoolFor(entry.assetType);
          const [own] = await tx
            .select()
            .from(matrixAccountsTable)
            .where(eq(matrixAccountsTable.accountNumber, entry.ownerAccount))
            .for("update");
          if (!own || Number(own.gravityBalance) < issuedGravity) {
            throw new Error("INSUFFICIENT_OWNER");
          }
          await adjustBalance(entry.ownerAccount, (-issuedGravity).toFixed(6), tx);
          await adjustBalance(pool, issuedGravity.toFixed(6), tx);
          await logTx(
            "VAULT_RELEASE",
            `🔓 [RELEASE] entry #${entryId} (${entry.assetType}): ${issuedGravity.toFixed(2)} G returned by ${entry.ownerAccount} to Growth pool`,
            entry.ownerAccount,
            pool,
            issuedGravity.toFixed(6),
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
    } else if (msg === "INSUFFICIENT_OWNER") {
      res.status(400).json({
        error: "Owner no longer holds the issued Gravity, so this asset can't be released until it's returned.",
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
        description: `🔒 [ESCROW LOCKED] ${sender.name} → ${receiverAccount}: ${txAmount.toFixed(2)} Gravity (awaiting Foundation release)`,
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
      message: "Funds locked in escrow. Awaiting Foundation release.",
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
