import {
  db,
  matrixAccountsTable,
  matrixTransactionsTable,
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

// The Vault holds the real-world ₹ value backing the gravity supply. It is kept
// SEPARATE from System Core (which holds the total minted Gravity). At all times
// the vault must hold at least 200% of the System Core gravity value.
export const VAULT_ACCOUNT = "000000000001";
// ₹ value represented by one unit of Gravity (₹10,000 = 1 G).
export const GRAVITY_RATE = 10000;
// Required over-collateralization: vault value must be ≥ 200% of gravity value.
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

export interface VaultStatus {
  vaultGravity: number; // Gravity currently held in the Vault (asset backing)
  coreGravity: number; // total minted Gravity in System Core
  requiredVault: number; // 200% of coreGravity, in Gravity
  ratio: number; // vaultGravity / coreGravity × 100 (% backed)
  healthy: boolean; // vaultGravity ≥ requiredVault
}

// Reads the live Vault and System Core balances (both in Gravity) and derives
// the 200% backing health. Single source of truth for the mint guard and the UI.
export async function getVaultStatus(
  exec: DbExecutor = db,
): Promise<VaultStatus> {
  const rows = await exec
    .select({
      accountNumber: matrixAccountsTable.accountNumber,
      gravityBalance: matrixAccountsTable.gravityBalance,
    })
    .from(matrixAccountsTable)
    .where(inArray(matrixAccountsTable.accountNumber, [VAULT_ACCOUNT, SYSTEM_MAIN]));

  const vaultGravity = Number(
    rows.find((r) => r.accountNumber === VAULT_ACCOUNT)?.gravityBalance ?? 0,
  );
  const coreGravity = Number(
    rows.find((r) => r.accountNumber === SYSTEM_MAIN)?.gravityBalance ?? 0,
  );
  const requiredVault = coreGravity * VAULT_BACKING_RATIO;
  const ratio =
    coreGravity > 0
      ? (vaultGravity / coreGravity) * 100
      : vaultGravity > 0
        ? Infinity
        : 100;

  return {
    vaultGravity,
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
      notInArray(matrixAccountsTable.accountNumber, [SYSTEM_MAIN, VAULT_ACCOUNT]),
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
 * Mints gravity, gated by the 200% Vault backing rule.
 *
 * The Vault (a separate account) holds Gravity that backs the system. System
 * Core holds the total minted Gravity. Before any gravity is created, the Vault
 * must hold at least 200% of the resulting System Core gravity — otherwise the
 * mint is rejected. Assets are deposited into the Vault separately (see the asset
 * deposit route); minting here does NOT add backing, it only issues gravity.
 *
 * 1. Guard: vaultGravity ≥ 200% × (coreGravity + newGravity).
 * 2. The newly minted gravity is recorded in System Core (the total supply).
 * 3. It is split across the pools: Founder 1%, Reserve 24%, Stability 25%,
 *    Security 25%, Growth 25%. The growth share lands in `targetWallet`.
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

  // Step 0: 200% Vault backing guard. After this mint, the vault must still hold
  // at least twice the System Core gravity value.
  const status = await getVaultStatus(exec);
  const newCoreGravity = status.coreGravity + gravityTotal;
  const requiredVault = newCoreGravity * VAULT_BACKING_RATIO;
  if (status.vaultGravity < requiredVault) {
    throw new Error(
      `INSUFFICIENT_VAULT_BACKING: Minting ${gravityTotal.toFixed(2)} G requires the Vault to hold ${requiredVault.toFixed(2)} G (200% backing), but the Vault holds only ${status.vaultGravity.toFixed(2)} G. Top up the Vault first.`,
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
    `🌌 [MINT] ${gravityTotal.toFixed(2)} Gravity minted for "${assetTitle}" (Vault-backed ≥200%)`,
    undefined,
    SYSTEM_MAIN,
    gravityTotal.toFixed(6),
    exec,
  );
  await logTx(
    "MINT",
    `👑 Founder 1%: ${founderCut.toFixed(2)} | 🏛️ Reserve 24%: ${reserveShare.toFixed(2)} | ⚖️ Stability 25%: ${stabilityShare.toFixed(2)} | 🛡️ Security 25%: ${securityShare.toFixed(2)} | 📈 Growth 25%: ${growthShare.toFixed(2)} → ${targetWallet}`,
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
