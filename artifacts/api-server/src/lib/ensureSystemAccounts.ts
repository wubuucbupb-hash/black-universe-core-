import { db, matrixAccountsTable, clusterCountersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SYSTEM_ACCOUNTS = [
  { accountNumber: "000000000000", name: "Black Universe — System Main Account", type: "System Core" },
  { accountNumber: "111111111111", name: "Founder Personal Account", type: "Founder Core" },
  { accountNumber: "222222222222", name: "Black Universe — Reserve Account", type: "Reserve Pool" },
  { accountNumber: "333333333333", name: "Black Universe — Stability Account", type: "Stability Pool" },
  { accountNumber: "444444444444", name: "Black Universe — Security Account", type: "Security Pool" },
  { accountNumber: "555555555555", name: "Black Universe — Growth Account", type: "Growth Pool" },
] as const;

const CLUSTER_PREFIXES = ["2", "3", "4", "5"] as const;

export async function ensureSystemAccounts(): Promise<void> {
  for (const acc of SYSTEM_ACCOUNTS) {
    const existing = await db
      .select({ accountNumber: matrixAccountsTable.accountNumber })
      .from(matrixAccountsTable)
      .where(eq(matrixAccountsTable.accountNumber, acc.accountNumber))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(matrixAccountsTable).values(acc);
      logger.info({ accountNumber: acc.accountNumber }, "System account seeded");
    }
  }

  for (const prefix of CLUSTER_PREFIXES) {
    const existing = await db
      .select()
      .from(clusterCountersTable)
      .where(eq(clusterCountersTable.clusterPrefix, prefix))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(clusterCountersTable).values({ clusterPrefix: prefix, nextCounter: 1 });
    }
  }

  logger.info("System accounts ready");
}
