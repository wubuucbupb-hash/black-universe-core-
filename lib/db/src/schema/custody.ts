import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";

export const custodyLedgerTable = pgTable("custody_ledger", {
  id: serial("id").primaryKey(),
  ownerAccount: text("owner_account").notNull(),
  assetType: text("asset_type").notNull(),
  valuationEncrypted: text("valuation_encrypted").notNull(),
  descriptionEncrypted: text("description_encrypted").notNull(),
  status: text("status").notNull().default("PENDING"),
  escrowFromAccount: text("escrow_from_account"),
  escrowToAccount: text("escrow_to_account"),
  escrowAmountEncrypted: text("escrow_amount_encrypted"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustodyEntry = typeof custodyLedgerTable.$inferSelect;
