import { db, matrixAccountsTable, clusterCountersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SYSTEM_ACCOUNTS = [
  { accountNumber: "000000000000", name: "Black Universe — System Main Account", type: "System Core" },
  { accountNumber: "000000000001", name: "Black Universe — Reserve Vault (System Asset Backing)", type: "Vault" },
  { accountNumber: "000000000002", name: "Black Universe — Users Vault (Custody Locks)", type: "Vault" },
  { accountNumber: "111111111111", name: "Black Universe — Foundation Account", type: "Foundation Core" },
  { accountNumber: "222222222222", name: "Black Universe — Reserve Account", type: "Reserve Pool" },
  { accountNumber: "333333333333", name: "Black Universe — Stability Account", type: "Stability Pool" },
  { accountNumber: "444444444444", name: "Black Universe — Security Account", type: "Security Pool" },
  { accountNumber: "555555555555", name: "Black Universe — Growth Account", type: "Growth Pool" },
  { accountNumber: "666666666666", name: "Black Universe — Real Estate Account", type: "Real Estate Pool" },
  { accountNumber: "777777777777", name: "Black Universe — Debt Account", type: "Debt Pool" },
  { accountNumber: "888888888888", name: "Black Universe — Equity Account", type: "Equity Pool" },
  { accountNumber: "999999999999", name: "Black Universe — Commodities/Money Markets Account", type: "Commodities Pool" },
] as const;

const CLUSTER_PREFIXES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

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
