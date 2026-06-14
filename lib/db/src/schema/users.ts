import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  passwordHash: text("password_hash"),
  role: text("role"),
  subCategory: text("sub_category"),
  documentUrl: text("document_url"),
  phoneNumber: text("phone_number"),
  accountNumber: text("account_number"),
  biometricKey: text("biometric_key"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

// Validation configuration for types
export const insertUserSchema = createInsertSchema(usersTable);

export type InsertUser = z.infer<typeof insertUserSchema> & {
  id?: number;
  createdAt?: Date;
};

export type User = typeof usersTable.$inferSelect;
