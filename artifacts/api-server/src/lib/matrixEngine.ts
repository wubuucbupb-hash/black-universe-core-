import {
  db,
  matrixAccountsTable,
  matrixTransactionsTable,
  clusterCountersTable,
  usersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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

// Citizens registered through the portal live in the "7" (Citizen) cluster.
export const CITIZEN_CLUSTER = "7";

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
 * Mints gravity for a verified asset and distributes it across the system pools.
 * The growth share (25%) is routed to `targetWallet` — i.e. the asset owner.
 * Returns the total minted plus the per-pool split breakdown.
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

  const gravityTotal = inrValue / 10000;

  const founderCut = gravityTotal * 0.01;
  const reserveShare = gravityTotal * 0.24;
  const stabilityShare = gravityTotal * 0.25;
  const securityShare = gravityTotal * 0.25;
  const growthShare = gravityTotal * 0.25;

  // Step 1: Mint total into system main
  await adjustBalance(SYSTEM_MAIN, gravityTotal.toFixed(6), exec);
  await logTx(
    "MINT",
    `🌌 [MINT] ${gravityTotal.toFixed(2)} Gravity minted for: "${assetTitle}"`,
    undefined,
    SYSTEM_MAIN,
    gravityTotal.toFixed(6),
    exec,
  );

  // Step 2: 1% Founder cut
  await adjustBalance(FOUNDER_ACCOUNT, founderCut.toFixed(6), exec);
  await adjustBalance(SYSTEM_MAIN, (-founderCut).toFixed(6), exec);
  await logTx(
    "MINT",
    `👑 [FOUNDER RULE] 1% (${founderCut.toFixed(2)} Gravity) → ${FOUNDER_ACCOUNT}`,
    SYSTEM_MAIN,
    FOUNDER_ACCOUNT,
    founderCut.toFixed(6),
    exec,
  );

  // Step 3: Pool distribution
  await adjustBalance(RESERVE_ACCOUNT, reserveShare.toFixed(6), exec);
  await adjustBalance(STABILITY_ACCOUNT, stabilityShare.toFixed(6), exec);
  await adjustBalance(SECURITY_ACCOUNT, securityShare.toFixed(6), exec);
  await adjustBalance(targetWallet, growthShare.toFixed(6), exec);
  await adjustBalance(
    SYSTEM_MAIN,
    (-(reserveShare + stabilityShare + securityShare + growthShare)).toFixed(6),
    exec,
  );

  await logTx(
    "MINT",
    `🏛️ [ROUTING] Reserve: ${reserveShare.toFixed(2)} | Stability: ${stabilityShare.toFixed(2)} | Security: ${securityShare.toFixed(2)}`,
    SYSTEM_MAIN,
    undefined,
    reserveShare.toFixed(6),
    exec,
  );
  await logTx(
    "MINT",
    `👥 [GROWTH] ${growthShare.toFixed(2)} Gravity → Wallet ${targetWallet}`,
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
  },
  exec: DbExecutor = db,
): Promise<string> {
  const { name, phone, email } = params;

  // Ensure the cluster counter exists, then atomically increment it.
  await exec
    .insert(clusterCountersTable)
    .values({ clusterPrefix: CITIZEN_CLUSTER, nextCounter: 1 })
    .onConflictDoNothing();

  const [counter] = await exec
    .update(clusterCountersTable)
    .set({ nextCounter: sql`${clusterCountersTable.nextCounter} + 1` })
    .where(eq(clusterCountersTable.clusterPrefix, CITIZEN_CLUSTER))
    .returning();

  const suffix = String(counter.nextCounter - 1).padStart(11, "0");
  const accountNumber = CITIZEN_CLUSTER + suffix;

  await exec.insert(matrixAccountsTable).values({
    accountNumber,
    name: name.trim(),
    type: "Citizen",
    cluster: CITIZEN_CLUSTER,
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    gravityBalance: "0",
  });

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
