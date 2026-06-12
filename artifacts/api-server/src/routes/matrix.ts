import { Router } from "express";
import { db, matrixAccountsTable, matrixTransactionsTable, clusterCountersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router = Router();

const FOUNDER_ACCOUNT = "111111111111";
const SYSTEM_MAIN = "000000000000";
const RESERVE_ACCOUNT = "222222222222";
const STABILITY_ACCOUNT = "333333333333";
const SECURITY_ACCOUNT = "444444444444";

function requireAdmin(req: any, res: any): boolean {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

async function logTx(
  txType: string,
  description: string,
  fromAccount?: string,
  toAccount?: string,
  amount?: string,
) {
  await db.insert(matrixTransactionsTable).values({
    txType,
    description,
    fromAccount: fromAccount ?? null,
    toAccount: toAccount ?? null,
    amount: amount ?? null,
  });
}

async function adjustBalance(accountNumber: string, delta: string) {
  await db
    .update(matrixAccountsTable)
    .set({
      gravityBalance: sql`${matrixAccountsTable.gravityBalance} + ${delta}`,
    })
    .where(eq(matrixAccountsTable.accountNumber, accountNumber));
}

// ── GET /api/matrix/accounts ───────────────────────────────────────────────
router.get("/matrix/accounts", async (_req, res): Promise<void> => {
  const accounts = await db
    .select()
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

// ── POST /api/matrix/citizens ──────────────────────────────────────────────
// Auto-active — no admin approval required
router.post("/matrix/citizens", async (req, res): Promise<void> => {
  try {
    const { name, phone, email, clusterPrefix } = req.body;

    if (!name?.trim() || !phone?.trim() || !clusterPrefix) {
      res.status(400).json({ error: "Name, phone and cluster are required" });
      return;
    }

    const validPrefixes = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    if (!validPrefixes.includes(String(clusterPrefix))) {
      res.status(400).json({ error: "Invalid cluster prefix" });
      return;
    }

    const prefix = String(clusterPrefix);

    // Atomically increment the counter and get the new value
    const [counter] = await db
      .update(clusterCountersTable)
      .set({ nextCounter: sql`${clusterCountersTable.nextCounter} + 1` })
      .where(eq(clusterCountersTable.clusterPrefix, prefix))
      .returning();

    if (!counter) {
      res.status(500).json({ error: "Cluster counter not found" });
      return;
    }

    const suffix = String(counter.nextCounter - 1).padStart(11, "0");
    const accountNumber = prefix + suffix;

    const clusterNames: Record<string, string> = {
      "1": "Universal",
      "2": "Sovereign",
      "3": "International",
      "4": "Nation",
      "5": "Institution",
      "6": "State",
      "7": "Citizen",
      "8": "Community",
      "9": "Union",
    };

    const [newAccount] = await db
      .insert(matrixAccountsTable)
      .values({
        accountNumber,
        name: name.trim(),
        type: clusterNames[prefix],
        cluster: prefix,
        nationalIdHash: "[Aadhaar Redacted]",
        phone: phone.trim(),
        email: email?.trim() || null,
        gravityBalance: "0",
      })
      .returning();

    await logTx(
      "CITIZEN_REGISTER",
      `✅ [CITIZEN] Account Created: ${accountNumber} — ${name.trim()}`,
      undefined,
      accountNumber,
      "0",
    );

    res.status(201).json({ account: newAccount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Registration failed";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/matrix/mint ──────────────────────────────────────────────────
// Founder (admin role) only — locked to account 111111111111
router.post("/matrix/mint", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  try {
    const { inrValue, assetTitle, targetWallet } = req.body;

    if (!inrValue || Number(inrValue) <= 0 || !assetTitle?.trim() || !targetWallet) {
      res.status(400).json({ error: "INR value, asset title and target wallet are required" });
      return;
    }

    const inr = Number(inrValue);
    const gravityTotal = inr / 10000;

    const founderCut = gravityTotal * 0.01;
    const reserveShare = gravityTotal * 0.24;
    const stabilityShare = gravityTotal * 0.25;
    const securityShare = gravityTotal * 0.25;
    const growthShare = gravityTotal * 0.25;

    // Step 1: Mint total into system main
    await adjustBalance(SYSTEM_MAIN, gravityTotal.toFixed(6));
    await logTx("MINT", `🌌 [MINT] ${gravityTotal.toFixed(2)} Gravity minted for: "${assetTitle}"`, undefined, SYSTEM_MAIN, gravityTotal.toFixed(6));

    // Step 2: 1% Founder cut
    await adjustBalance(FOUNDER_ACCOUNT, founderCut.toFixed(6));
    await adjustBalance(SYSTEM_MAIN, (-founderCut).toFixed(6));
    await logTx("MINT", `👑 [FOUNDER RULE] 1% (${founderCut.toFixed(2)} Gravity) → ${FOUNDER_ACCOUNT}`, SYSTEM_MAIN, FOUNDER_ACCOUNT, founderCut.toFixed(6));

    // Step 3: Pool distribution
    await adjustBalance(RESERVE_ACCOUNT, reserveShare.toFixed(6));
    await adjustBalance(STABILITY_ACCOUNT, stabilityShare.toFixed(6));
    await adjustBalance(SECURITY_ACCOUNT, securityShare.toFixed(6));
    await adjustBalance(targetWallet, growthShare.toFixed(6));
    await adjustBalance(SYSTEM_MAIN, (-(reserveShare + stabilityShare + securityShare + growthShare)).toFixed(6));

    await logTx("MINT", `🏛️ [ROUTING] Reserve: ${reserveShare.toFixed(2)} | Stability: ${stabilityShare.toFixed(2)} | Security: ${securityShare.toFixed(2)}`, SYSTEM_MAIN, undefined, reserveShare.toFixed(6));
    await logTx("MINT", `👥 [GROWTH] ${growthShare.toFixed(2)} Gravity → Wallet ${targetWallet}`, SYSTEM_MAIN, targetWallet, growthShare.toFixed(6));

    res.json({
      success: true,
      gravityTotal,
      splits: { founder: founderCut, reserve: reserveShare, stability: stabilityShare, security: securityShare, growth: growthShare },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Mint failed";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/matrix/transfer ──────────────────────────────────────────────
// P2P transfer — 1% tax to Founder, 99% to receiver
router.post("/matrix/transfer", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

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
