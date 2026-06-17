import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";

// Buffer of system-pool fees awaiting batch aggregation. High-frequency fees
// (e.g. the 1% P2P transfer charge to the Founder pool) are appended here
// inside the same transaction as the money move, then a background job sums
// them into the pool account once per interval — avoiding write contention on
// the single hot pool-account row.
export const pendingFeesTable = pgTable("pending_fees", {
  id: serial("id").primaryKey(),
  poolAccount: text("pool_account").notNull(),
  amount: numeric("amount", { precision: 30, scale: 6 }).notNull(),
  sourceType: text("source_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PendingFee = typeof pendingFeesTable.$inferSelect;
