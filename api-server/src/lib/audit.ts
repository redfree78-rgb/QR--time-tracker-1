import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";

export type AuditAction =
  | "account.create"
  | "account.update"
  | "account.delete"
  | "account.password_change"
  | "auth.login_success"
  | "auth.login_failure";

export async function recordAudit(
  req: Request,
  params: {
    action: AuditAction;
    targetType: string;
    targetId?: number | null;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      actorId: req.session?.accountId ?? null,
      actorUsername: req.session?.username ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    req.log?.error({ err }, "failed to record audit log");
  }
}
