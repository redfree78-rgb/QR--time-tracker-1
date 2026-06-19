import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { and, desc, eq, gte, lte, lt, or, sql, type SQL } from "drizzle-orm";
import { ListAuditLogsQueryParams, ExportAuditLogsQueryParams } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/auth";

const router = Router();

// Apply admin gate only to /audit-logs paths so it does not block unrelated
// requests passing through the parent router.
router.use("/audit-logs", requireAdmin);

type AuditQuery = {
  actorId?: number | null;
  action?: string | null;
  from?: string | null;
  to?: string | null;
};

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function buildFilters(q: AuditQuery): SQL[] {
  const filters: SQL[] = [];
  if (q.actorId != null) filters.push(eq(auditLogsTable.actorId, q.actorId));
  if (q.action) filters.push(eq(auditLogsTable.action, q.action));

  const from = parseDate(q.from);
  if (from) filters.push(gte(auditLogsTable.createdAt, from));

  const to = parseDate(q.to);
  if (to) filters.push(lte(auditLogsTable.createdAt, to));

  return filters;
}

// GET /audit-logs — paginated + filtered list
router.get("/audit-logs", async (req, res) => {
  const parsed = ListAuditLogsQueryParams.safeParse(req.query);
  const q = parsed.success ? parsed.data : {};

  const limit = q.limit != null ? Math.min(Math.max(1, q.limit), 200) : 50;
  const offset = q.offset != null ? Math.max(0, q.offset) : 0;

  const filters = buildFilters(q);
  const whereExpr = filters.length > 0 ? and(...filters) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogsTable)
    .where(whereExpr);

  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(whereExpr)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    total: count,
    items: rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorUsername: r.actorUsername,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      details: r.details ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

function csvEscape(value: unknown): string {
  if (value == null) return "";
  let s = typeof value === "string" ? value : JSON.stringify(value);
  // Neutralize formula injection: cells starting with =, +, -, @, or tab
  // become executable when opened in Excel/Sheets. Prefix with a single quote.
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /audit-logs/export.csv — full filtered export.
// Streamed in batches so memory stays bounded regardless of how many rows match;
// there is no fixed row cap. The compound order (createdAt, id) keeps the
// keyset-style offset pagination stable across batches.
router.get("/audit-logs/export.csv", async (req, res) => {
  const parsed = ExportAuditLogsQueryParams.safeParse(req.query);
  const q = parsed.success ? parsed.data : {};

  const filters = buildFilters(q);
  const whereExpr = filters.length > 0 ? and(...filters) : undefined;

  const header = [
    "id",
    "createdAt",
    "actorId",
    "actorUsername",
    "action",
    "targetType",
    "targetId",
    "details",
  ];

  const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // BOM so Excel opens UTF-8 (Korean) correctly
  res.write("\uFEFF" + header.join(",") + "\n");

  const BATCH = 1000;
  let cursor: { createdAt: Date; id: number } | null = null;
  for (;;) {
    const conds: SQL[] = [];
    if (whereExpr) conds.push(whereExpr);
    if (cursor) {
      // Keyset cursor over the (createdAt DESC, id DESC) order. This is stable
      // even if rows are inserted during the export, unlike OFFSET paging.
      conds.push(
        or(
          lt(auditLogsTable.createdAt, cursor.createdAt),
          and(eq(auditLogsTable.createdAt, cursor.createdAt), lt(auditLogsTable.id, cursor.id))
        )!
      );
    }

    const rows = await db
      .select()
      .from(auditLogsTable)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
      .limit(BATCH);

    if (rows.length === 0) break;

    const lines = rows.map((r) =>
      [
        csvEscape(r.id),
        csvEscape(r.createdAt.toISOString()),
        csvEscape(r.actorId),
        csvEscape(r.actorUsername),
        csvEscape(r.action),
        csvEscape(r.targetType),
        csvEscape(r.targetId),
        csvEscape(r.details),
      ].join(",")
    );
    res.write(lines.join("\n") + "\n");

    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
    if (rows.length < BATCH) break;
  }

  res.end();
});

export default router;
