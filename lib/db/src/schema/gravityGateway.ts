import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
} from "drizzle-orm/pg-core";

// INR → Gravity on-ramp. A citizen pays INR directly to the bank/UPI shown on
// the gateway, uploads payment proof, and submits a request. An admin verifies
// the proof and approves it, which credits Gravity at ₹10,000 = 1 G.
export const gravityPurchaseRequestsTable = pgTable("gravity_purchase_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  inrAmount: numeric("inr_amount", { precision: 20, scale: 2 }).notNull(),
  gravityAmount: numeric("gravity_amount", { precision: 30, scale: 6 }).notNull(),
  proofUrls: text("proof_urls").array().notNull().default([]),
  reference: text("reference"),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Single-row (id = 1) table holding the bank/UPI details shown to citizens on
// the INR → Gravity gateway. Admin-editable from the admin panel.
export const gatewaySettingsTable = pgTable("gateway_settings", {
  id: integer("id").primaryKey().default(1),
  bankName: text("bank_name"),
  accountName: text("account_name"),
  accountNumber: text("account_number"),
  ifsc: text("ifsc"),
  upiId: text("upi_id"),
  instructions: text("instructions"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GravityPurchaseRequest =
  typeof gravityPurchaseRequestsTable.$inferSelect;
export type GatewaySettings = typeof gatewaySettingsTable.$inferSelect;
