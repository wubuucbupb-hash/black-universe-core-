import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
} from "drizzle-orm/pg-core";

export const matrixAccountsTable = pgTable("matrix_accounts", {
  accountNumber: text("account_number").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  cluster: text("cluster"),
  gravityBalance: numeric("gravity_balance", { precision: 30, scale: 6 })
    .notNull()
    .default("0"),
  nationalIdHash: text("national_id_hash"),
  phone: text("phone"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const matrixTransactionsTable = pgTable("matrix_transactions", {
  id: serial("id").primaryKey(),
  txType: text("tx_type").notNull(),
  fromAccount: text("from_account"),
  toAccount: text("to_account"),
  amount: numeric("amount", { precision: 30, scale: 6 }),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
});

export const clusterCountersTable = pgTable("cluster_counters", {
  clusterPrefix: text("cluster_prefix").primaryKey(),
  nextCounter: integer("next_counter").notNull().default(1),
});

export type MatrixAccount = typeof matrixAccountsTable.$inferSelect;
export type MatrixTransaction = typeof matrixTransactionsTable.$inferSelect;
