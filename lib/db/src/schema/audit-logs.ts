import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  actorUsername: text("actor_username"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;

export const auditLogActions = [
  "account.create",
  "account.update",
  "account.delete",
  "account.password_change",
  "auth.login_success",
  "auth.login_failure",
] as const;

export const AuditLogAction = z.enum(auditLogActions);
