import { Router } from "express";
import type { Request, Response } from "express";
import {
  assetsTable,
  db,
  matrixAccountsTable,
  matrixTransactionsTable,
  usersTable,
  gravityPurchaseRequestsTable,
  gatewaySettingsTable,
} from "@workspace/db";
import { eq, desc, isNull, or } from "drizzle-orm";
import {
  FOUNDER_ACCOUNT,
  GROWTH_ACCOUNT,
  GRAVITY_RATE,
  EQUITY_PRICE_GRAVITY,
  adjustBalance,
  adjustEquity,
  ensureUserMatrixAccount,
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
      equityUnits: matrixAccountsTable.equityUnits,
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
    const { inrValue, assetTitle, assetType, description, documentUrls } =
      req.body;

    if (!inrValue || Number(inrValue) <= 0 || !assetTitle?.trim()) {
      res.status(400).json({ error: "INR value and asset title are required" });
      return;
    }

    const docs: string[] = Array.isArray(documentUrls)
      ? documentUrls.filter((u): u is string => typeof u === "string" && !!u)
      : [];

    // System mint: the growth share routes to the Growth Pool so the Founder
    // always receives exactly 1% (never doubled via a user-selected target).
    const { gravityTotal, splits } = await mintGravity({
      inrValue: Number(inrValue),
      assetTitle: String(assetTitle),
      targetWallet: GROWTH_ACCOUNT,
    });

    // Persist the documented asset backing this mint so the proof papers are
    // retained and visible in the asset registry. Marked already-minted so it is
    // never re-deposited through the normal approval pipeline.
    if (docs.length > 0) {
      const userId = req.session?.userId;
      if (userId) {
        await db.insert(assetsTable).values({
          userId,
          assetType:
            typeof assetType === "string" && assetType.trim()
              ? assetType
              : "real_estate",
          claimedValue: String(inrValue),
          description:
            typeof description === "string" && description.trim()
              ? `${assetTitle} — ${description}`
              : String(assetTitle),
          documentUrls: docs,
          status: "minted",
          mintedAt: new Date(),
          gravityIssued: String(gravityTotal),
        });
      }
    }

    res.json({ success: true, gravityTotal, splits });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Mint failed";
    const underBacked = raw.startsWith("INSUFFICIENT_VAULT_BACKING");
    const msg = raw.replace(/^INSUFFICIENT_VAULT_BACKING:\s*/, "");
    res.status(underBacked ? 400 : 500).json({ error: msg });
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

    // The 1% transaction charge is deducted SEPARATELY from the sender — the
    // receiver always gets the FULL amount (charge is not netted out of it).
    // The sender must hold at least the transfer amount; the separate charge
    // may push their wallet into overage (negative balance), which is recorded
    // on the transaction.
    const charge = txAmount * 0.01;

    await adjustBalance(senderAccount, (-txAmount).toFixed(6));
    await adjustBalance(receiverAccount, txAmount.toFixed(6));
    await adjustBalance(senderAccount, (-charge).toFixed(6));
    await adjustBalance(FOUNDER_ACCOUNT, charge.toFixed(6));

    const newSenderBalance = senderBalance - txAmount - charge;
    const overage = newSenderBalance < 0 ? -newSenderBalance : 0;

    await logTx(
      "P2P_TRANSFER",
      `💸 [P2P TX] ${sender.name} → ${receiverAccount}: ${txAmount.toFixed(2)} Gravity (full; charge separate)`,
      senderAccount,
      receiverAccount,
      txAmount.toFixed(6),
    );
    await logTx(
      "TX_CHARGE",
      `🔥 [CHARGE] 1% (${charge.toFixed(2)} Gravity) → Founder, deducted from ${sender.name}${overage > 0 ? ` ⚠️ ACCOUNT OVERAGE: -${overage.toFixed(2)} Gravity` : ""}`,
      senderAccount,
      FOUNDER_ACCOUNT,
      charge.toFixed(6),
    );

    res.json({
      success: true,
      sent: txAmount,
      received: txAmount,
      charge,
      newSenderBalance,
      overage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Transfer failed";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/matrix/equity/buy ────────────────────────────────────────────
// Spend Gravity to buy Black Universe Equity units (EQUITY_PRICE_GRAVITY G = 1
// unit). The spent Gravity is routed into the Growth pool, so total Gravity is
// conserved; the buyer's equityUnits go up.
router.post("/matrix/equity/buy", async (req, res): Promise<void> => {
  const user = await getAuthUser(req, res);
  if (!user) return;

  try {
    const gravityAmount = Number(req.body?.gravityAmount);
    if (!gravityAmount || gravityAmount <= 0) {
      res.status(400).json({ error: "A positive Gravity amount is required" });
      return;
    }

    const accountNumber = await ensureUserMatrixAccount(user);

    const [account] = await db
      .select()
      .from(matrixAccountsTable)
      .where(eq(matrixAccountsTable.accountNumber, accountNumber))
      .limit(1);

    if (!account) {
      res.status(404).json({ error: "Your wallet was not found" });
      return;
    }

    if (Number(account.gravityBalance) < gravityAmount) {
      res.status(400).json({ error: "Insufficient Gravity balance" });
      return;
    }

    const equityUnits = gravityAmount / EQUITY_PRICE_GRAVITY;

    await db.transaction(async (tx) => {
      await adjustBalance(accountNumber, (-gravityAmount).toFixed(6), tx);
      await adjustBalance(GROWTH_ACCOUNT, gravityAmount.toFixed(6), tx);
      await adjustEquity(accountNumber, equityUnits.toFixed(6), tx);
      await logTx(
        "EQUITY_BUY",
        `📜 [EQUITY] ${account.name} bought ${equityUnits.toFixed(6)} BU Equity for ${gravityAmount.toFixed(2)} Gravity (${EQUITY_PRICE_GRAVITY} G/unit)`,
        accountNumber,
        GROWTH_ACCOUNT,
        gravityAmount.toFixed(6),
        tx,
      );
    });

    res.json({
      success: true,
      gravitySpent: gravityAmount,
      equityUnits,
      pricePerUnit: EQUITY_PRICE_GRAVITY,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Equity purchase failed";
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/matrix/gateway-settings ───────────────────────────────────────
// Bank / UPI details a citizen pays INR to before submitting a Gravity purchase
// request. Available to any logged-in user.
router.get("/matrix/gateway-settings", async (req, res): Promise<void> => {
  const user = await getAuthUser(req, res);
  if (!user) return;
  const [settings] = await db
    .select()
    .from(gatewaySettingsTable)
    .where(eq(gatewaySettingsTable.id, 1))
    .limit(1);
  res.json({ settings: settings ?? null });
});

// ── POST /api/matrix/gravity-purchase ──────────────────────────────────────
// Citizen submits an INR → Gravity request after paying to the bank/UPI. They
// attach payment proof; an admin verifies and approves it to credit Gravity.
router.post("/matrix/gravity-purchase", async (req, res): Promise<void> => {
  const user = await getAuthUser(req, res);
  if (!user) return;

  try {
    const inrAmount = Number(req.body?.inrAmount);
    const reference: string | undefined = req.body?.reference;
    const proofUrls: unknown = req.body?.proofUrls;

    if (!inrAmount || inrAmount <= 0) {
      res.status(400).json({ error: "A positive INR amount is required" });
      return;
    }
    if (
      !Array.isArray(proofUrls) ||
      proofUrls.length === 0 ||
      !proofUrls.every((p) => typeof p === "string")
    ) {
      res
        .status(400)
        .json({ error: "At least one payment proof document is required" });
      return;
    }

    // Make sure the buyer has a wallet ready to receive Gravity on approval.
    await ensureUserMatrixAccount(user);

    const gravityAmount = inrAmount / GRAVITY_RATE;

    const [request] = await db
      .insert(gravityPurchaseRequestsTable)
      .values({
        userId: user.id,
        inrAmount: inrAmount.toFixed(2),
        gravityAmount: gravityAmount.toFixed(6),
        proofUrls: proofUrls as string[],
        reference: reference?.trim() || null,
        status: "pending",
      })
      .returning();

    res.json({ success: true, request });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Gravity purchase request failed";
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/matrix/my-gravity-purchases ───────────────────────────────────
// The logged-in citizen's own INR → Gravity requests and their statuses.
router.get(
  "/matrix/my-gravity-purchases",
  async (req, res): Promise<void> => {
    const user = await getAuthUser(req, res);
    if (!user) return;
    const requests = await db
      .select()
      .from(gravityPurchaseRequestsTable)
      .where(eq(gravityPurchaseRequestsTable.userId, user.id))
      .orderBy(desc(gravityPurchaseRequestsTable.createdAt))
      .limit(50);
    res.json({ requests });
  },
);

export default router;
