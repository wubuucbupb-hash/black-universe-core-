import {
  db,
  matrixAccountsTable,
  matrixTransactionsTable,
  pendingFeesTable,
  usersTable,
} from "@workspace/db";
import { eq, sql, like, inArray, notInArray } from "drizzle-orm";

// Either the root db handle or a transaction handle from db.transaction(...).
// Lets callers run engine operations inside an atomic transaction.
type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const SYSTEM_MAIN = "000000000000";
export const FOUNDER_ACCOUNT = "111111111111";
export const RESERVE_ACCOUNT = "222222222222";
export const STABILITY_ACCOUNT = "333333333333";
export const SECURITY_ACCOUNT = "444444444444";
export const GROWTH_ACCOUNT = "555555555555";

// The Vault holds the Gravity backing the supply. It is kept SEPARATE from
// System Core (which holds the minted Gravity routed for distribution). Each
// approved asset locks its FULL Gravity value into the Vault; minting then
// creates a MATCHING amount in System Core — so Vault and Core grow 1:1 (the
// asset value exists twice = 200% total creation), and Core never exceeds Vault.
export const VAULT_ACCOUNT = "000000000001";
// Users Vault — holds the Gravity value of assets USERS lock into custody (the
// manual locks on the /vault page). Kept STRUCTURALLY SEPARATE from the System
// Vault so user-locked value NEVER backs minting: the mint gate reads the
// System Vault (VAULT_ACCOUNT) only. The Users Vault is still visible and is
// counted in the Total Vault purely for display.
export const USERS_VAULT = "000000000002";
// ₹ value represented by one unit of Gravity (₹10,000 = 1 G).
export const GRAVITY_RATE = 10000;
// Backing floor: the Vault Value (System Vault + all system pools, where the 1%
// fees accumulate) must be at least 200% of the System Core supply (2:1).
export const VAULT_BACKING_RATIO = 2;
// Black Universe Equity price: how many Gravity buys ONE BU Equity unit.
// Change this single constant to re-price equity.
export const EQUITY_PRICE_GRAVITY = 100;

// Network cluster layers a citizen can join at registration. The chosen digit
// becomes the account-number prefix; cluster 7 (Citizen) is the default.
export const VALID_CLUSTERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export const DEFAULT_CLUSTER = "7";
export const CLUSTER_LABELS: Record<string, string> = {
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

export async function logTx(
  txType: string,
  description: string,
  fromAccount?: string,
  toAccount?: string,
  amount?: string,
  exec: DbExecutor = db,
): Promise<void> {
  await exec.insert(matrixTransactionsTable).values({
    txType,
    description,
    fromAccount: fromAccount ?? null,
    toAccount: toAccount ?? null,
    amount: amount ?? null,
  });
}

export async function adjustBalance(
  accountNumber: string,
  delta: string,
  exec: DbExecutor = db,
): Promise<void> {
  await exec
    .update(matrixAccountsTable)
    .set({
      gravityBalance: sql`${matrixAccountsTable.gravityBalance} + ${delta}`,
    })
    .where(eq(matrixAccountsTable.accountNumber, accountNumber));
}

// Adjusts an account's Black Universe Equity holdings by `delta` (signed).
export async function adjustEquity(
  accountNumber: string,
  delta: string,
  exec: DbExecutor = db,
): Promise<void> {
  await exec
    .update(matrixAccountsTable)
    .set({
      equityUnits: sql`${matrixAccountsTable.equityUnits} + ${delta}`,
    })
    .where(eq(matrixAccountsTable.accountNumber, accountNumber));
}

// Absolute set (not a delta) — used by the Vault top-up / re-anchor admin tool.
export async function setBalance(
  accountNumber: string,
  value: string,
  exec: DbExecutor = db,
): Promise<void> {
  await exec
    .update(matrixAccountsTable)
    .set({ gravityBalance: value })
    .where(eq(matrixAccountsTable.accountNumber, accountNumber));
}

// ── Batch fee aggregation ──────────────────────────────────────────────────
// High-frequency fees (e.g. the 1% P2P transfer charge) are NOT written to the
// hot pool-account row on every transaction — that single row would serialise
// every transfer. Instead each fee is appended to `pending_fees` (an append-
// only insert, no row contention) inside the SAME atomic transaction as the
// money move, so value is always conserved. A background job (flushPendingFees)
// then aggregates the buffer into the pool account once per interval.
export async function recordPoolFee(
  poolAccount: string,
  amount: string,
  sourceType: string,
  exec: DbExecutor = db,
): Promise<void> {
  await exec.insert(pendingFeesTable).values({ poolAccount, amount, sourceType });
}

let flushing = false;

// Aggregates all buffered fees into their pool accounts in a single atomic
// transaction and clears them. Overlapping calls are skipped, and rows are
// locked with SKIP LOCKED so two workers never double-apply the same fee.
export async function flushPendingFees(): Promise<{
  flushed: number;
  pools: number;
}> {
  if (flushing) return { flushed: 0, pools: 0 };
  flushing = true;
  try {
    return await db.transaction(async (tx) => {
      const pending = await tx
        .select()
        .from(pendingFeesTable)
        .for("update", { skipLocked: true });
      if (pending.length === 0) return { flushed: 0, pools: 0 };

      const sums = new Map<string, number>();
      for (const fee of pending) {
        sums.set(
          fee.poolAccount,
          (sums.get(fee.poolAccount) ?? 0) + Number(fee.amount),
        );
      }
      for (const [poolAccount, total] of sums) {
        // Transaction revenue (P2P / escrow fees) accrues to its pool account
        // ONLY (the Foundation account for the 1% fees). It is NOT added to the
        // System Vault backing — the Vault grows only from asset approvals and
        // revaluation. The accumulated Foundation balance IS the fee total.
        await adjustBalance(poolAccount, total.toFixed(6), tx);
      }
      await tx.delete(pendingFeesTable).where(
        inArray(
          pendingFeesTable.id,
          pending.map((p) => p.id),
        ),
      );
      return { flushed: pending.length, pools: sums.size };
    });
  } finally {
    flushing = false;
  }
}

export interface VaultStatus {
  vaultGravity: number; // System Vault Gravity (asset backing) — the ONLY pool that backs minting
  usersVaultGravity: number; // Users Vault Gravity (custody locks) — does NOT back minting
  totalVaultGravity: number; // System Vault + Users Vault (display only)
  coreGravity: number; // total minted Gravity in System Core
  requiredVault: number; // 200% of coreGravity, in Gravity
  ratio: number; // vaultGravity / coreGravity × 100 (% backed)
  healthy: boolean; // vaultGravity ≥ requiredVault
}

// Reads the live Vault and System Core balances (both in Gravity) and derives
// the 1:1 backing health. Single source of truth for the mint guard and the UI.
export async function getVaultStatus(
  exec: DbExecutor = db,
): Promise<VaultStatus> {
  const rows = await exec
    .select({
      accountNumber: matrixAccountsTable.accountNumber,
      gravityBalance: matrixAccountsTable.gravityBalance,
    })
    .from(matrixAccountsTable)
    .where(
      inArray(matrixAccountsTable.accountNumber, [
        VAULT_ACCOUNT,
        USERS_VAULT,
        SYSTEM_MAIN,
        FOUNDER_ACCOUNT,
        RESERVE_ACCOUNT,
        STABILITY_ACCOUNT,
        SECURITY_ACCOUNT,
        GROWTH_ACCOUNT,
      ]),
    );

  const bal = (acc: string) =>
    Number(rows.find((r) => r.accountNumber === acc)?.gravityBalance ?? 0);

  // Vault Value = the real-asset System Vault PLUS every system pool (where the
  // 1% transfer/escrow fees accumulate). Fees never physically move into the
  // Vault account — they stay in the Foundation pool — but they COUNT toward the
  // backing. So backing grows live from assets, revaluation AND system fees.
  const vaultGravity =
    bal(VAULT_ACCOUNT) +
    bal(FOUNDER_ACCOUNT) +
    bal(RESERVE_ACCOUNT) +
    bal(STABILITY_ACCOUNT) +
    bal(SECURITY_ACCOUNT) +
    bal(GROWTH_ACCOUNT);
  const usersVaultGravity = bal(USERS_VAULT);
  const coreGravity = bal(SYSTEM_MAIN);
  const requiredVault = coreGravity * VAULT_BACKING_RATIO;
  const ratio =
    coreGravity > 0
      ? (vaultGravity / coreGravity) * 100
      : vaultGravity > 0
        ? Infinity
        : 100;

  return {
    vaultGravity,
    usersVaultGravity,
    totalVaultGravity: vaultGravity + usersVaultGravity,
    coreGravity,
    requiredVault,
    ratio,
    healthy: vaultGravity >= requiredVault,
  };
}

// Sum of all distributed Gravity (pools + citizens), excluding System Core and
// the Vault. Used to re-anchor System Core to the true circulating supply.
export async function totalDistributedGravity(
  exec: DbExecutor = db,
): Promise<number> {
  const [row] = await exec
    .select({
      total: sql<string>`COALESCE(SUM(${matrixAccountsTable.gravityBalance}), 0)`,
    })
    .from(matrixAccountsTable)
    .where(
      notInArray(matrixAccountsTable.accountNumber, [
        SYSTEM_MAIN,
        VAULT_ACCOUNT,
        USERS_VAULT,
      ]),
    );
  return Number(row?.total ?? 0);
}

export interface MintSplits {
  founder: number;
  reserve: number;
  stability: number;
  security: number;
  growth: number;
}

export interface MintResult {
  gravityTotal: number;
  splits: MintSplits;
}

/**
 * Mints gravity, gated by the 1:1 Vault backing rule.
 *
 * The Vault (a separate account) holds the Gravity that backs the system; each
 * approved asset locks its full value into the Vault. System Core holds the
 * minted Gravity that gets distributed. Minting creates a MATCHING amount in
 * System Core (so Vault and Core stay 1:1) — minting here does NOT add backing,
 * it only issues the distribution-side gravity against the Vault that the asset
 * approval already locked.
 *
 * 1. Guard: vaultGravity ≥ (coreGravity + newGravity)  (Core never exceeds Vault).
 * 2. The newly minted gravity is recorded in System Core (the distribution side).
 * 3. It is split across the pools: Founder 1%, Reserve 24%, Stability 25%,
 *    Security 25%, Growth 25%. Only the growth share flows out, to `targetWallet`.
 */
export async function mintGravity(
  params: {
    inrValue: number;
    assetTitle: string;
    targetWallet: string;
  },
  exec: DbExecutor = db,
): Promise<MintResult> {
  const { inrValue, assetTitle, targetWallet } = params;

  const gravityTotal = inrValue / GRAVITY_RATE;

  // Step 0: 200% Vault backing guard. After this mint, the Vault Value (System
  // Vault + all system pools/fees) must still be at least 200% of System Core.
  const status = await getVaultStatus(exec);
  const newCoreGravity = status.coreGravity + gravityTotal;
  const requiredVault = newCoreGravity * VAULT_BACKING_RATIO;
  if (status.vaultGravity < requiredVault) {
    throw new Error(
      `INSUFFICIENT_VAULT_BACKING: Minting ${gravityTotal.toFixed(2)} G needs the Vault to hold ${requiredVault.toFixed(2)} G of backing (200%), but the Vault holds only ${status.vaultGravity.toFixed(2)} G. Lock more asset backing into the Vault first.`,
    );
  }

  const founderCut = gravityTotal * 0.01;
  const reserveShare = gravityTotal * 0.24;
  const stabilityShare = gravityTotal * 0.25;
  const securityShare = gravityTotal * 0.25;
  const growthShare = gravityTotal * 0.25;

  // Step 1: Record the newly minted gravity in System Core (the total supply).
  await adjustBalance(SYSTEM_MAIN, gravityTotal.toFixed(6), exec);

  // Step 2: Distribute the minted gravity across the system pools.
  await adjustBalance(FOUNDER_ACCOUNT, founderCut.toFixed(6), exec);
  await adjustBalance(RESERVE_ACCOUNT, reserveShare.toFixed(6), exec);
  await adjustBalance(STABILITY_ACCOUNT, stabilityShare.toFixed(6), exec);
  await adjustBalance(SECURITY_ACCOUNT, securityShare.toFixed(6), exec);
  await adjustBalance(targetWallet, growthShare.toFixed(6), exec);

  await logTx(
    "MINT",
    `🌌 [MINT] ${gravityTotal.toFixed(2)} Gravity minted for "${assetTitle}" (Vault-backed 1:1)`,
    undefined,
    SYSTEM_MAIN,
    gravityTotal.toFixed(6),
    exec,
  );
  await logTx(
    "MINT",
    `👑 Foundation 1%: ${founderCut.toFixed(2)} | 🏛️ Reserve 24%: ${reserveShare.toFixed(2)} | ⚖️ Stability 25%: ${stabilityShare.toFixed(2)} | 🛡️ Security 25%: ${securityShare.toFixed(2)} | 📈 Growth 25%: ${growthShare.toFixed(2)} → ${targetWallet}`,
    SYSTEM_MAIN,
    targetWallet,
    growthShare.toFixed(6),
    exec,
  );

  return {
    gravityTotal,
    splits: {
      founder: founderCut,
      reserve: reserveShare,
      stability: stabilityShare,
      security: securityShare,
      growth: growthShare,
    },
  };
}

/**
 * Atomically generates the next account number in the Citizen cluster and
 * inserts a linked Matrix account. Returns the new account number.
 */
export async function provisionCitizenAccount(
  params: {
    name: string;
    phone?: string | null;
    email?: string | null;
    cluster?: string;
  },
  exec: DbExecutor = db,
): Promise<string> {
  const { name, phone, email } = params;
  const cluster = VALID_CLUSTERS.includes(params.cluster as (typeof VALID_CLUSTERS)[number])
    ? (params.cluster as string)
    : DEFAULT_CLUSTER;

  // Allocate the LOWEST free account number in the cluster. Numbers freed by
  // deleted accounts are therefore reused — auto-allotted to the next real
  // citizen — instead of being skipped forever by a monotonic counter. The
  // accountNumber primary key guarantees uniqueness; on a concurrent collision
  // we recompute the lowest gap and retry.
  const MAX_ATTEMPTS = 50;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const taken = await exec
      .select({ accountNumber: matrixAccountsTable.accountNumber })
      .from(matrixAccountsTable)
      .where(like(matrixAccountsTable.accountNumber, `${cluster}%`));

    const usedCounters = new Set<number>();
    for (const row of taken) {
      const acct = row.accountNumber;
      if (acct.length === 12 && acct.startsWith(cluster)) {
        const n = Number(acct.slice(1));
        if (Number.isInteger(n) && n > 0) usedCounters.add(n);
      }
    }

    let counter = 1;
    while (usedCounters.has(counter)) counter++;

    const accountNumber = cluster + String(counter).padStart(11, "0");

    const inserted = await exec
      .insert(matrixAccountsTable)
      .values({
        accountNumber,
        name: name.trim(),
        type: CLUSTER_LABELS[cluster] ?? "Citizen",
        cluster,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        gravityBalance: "0",
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length > 0) {
      await logTx(
        "CITIZEN_REGISTER",
        `✅ [CITIZEN] Account Created: ${accountNumber} — ${name.trim()}`,
        undefined,
        accountNumber,
        "0",
        exec,
      );
      return accountNumber;
    }
    // A concurrent registration claimed this number — recompute and retry.
  }

  throw new Error(
    `Could not allocate an account number in cluster ${cluster}`,
  );
}

/**
 * Returns the user's linked Matrix account number, provisioning one on the fly
 * if the user predates the auto-provision flow. Keeps the user row in sync.
 */
export async function ensureUserMatrixAccount(
  user: typeof usersTable.$inferSelect,
  exec: DbExecutor = db,
): Promise<string> {
  if (user.accountNumber) {
    const [existing] = await exec
      .select({ accountNumber: matrixAccountsTable.accountNumber })
      .from(matrixAccountsTable)
      .where(eq(matrixAccountsTable.accountNumber, user.accountNumber))
      .limit(1);
    if (existing) return user.accountNumber;
  }

  const accountNumber = await provisionCitizenAccount(
    {
      name: user.name ?? user.email ?? "Citizen",
      phone: user.phoneNumber,
      email: user.email,
    },
    exec,
  );

  await exec
    .update(usersTable)
    .set({ accountNumber })
    .where(eq(usersTable.id, user.id));

  return accountNumber;
}
