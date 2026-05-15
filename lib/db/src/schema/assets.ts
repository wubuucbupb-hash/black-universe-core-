import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  assetType: text("asset_type").notNull(),
  claimedValue: numeric("claimed_value", { precision: 20, scale: 2 }).notNull(),
  description: text("description").notNull(),
  documentNote: text("document_note"),
  documentUrls: text("document_urls").array().notNull().default([]),
  status: text("status").notNull().default("pending"),
  feeAmount: numeric("fee_amount", { precision: 20, scale: 2 }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
