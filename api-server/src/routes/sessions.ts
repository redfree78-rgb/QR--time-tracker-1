import { Router } from "express";
import { eq, and, desc, sql, gte, lte, isNotNull } from "drizzle-orm";
import { db, usersTable, sessionsTable } from "@workspace/db";
import ExcelJS from "exceljs";
import {
  ListSessionsQueryParams,
  CheckInBody,
  CheckOutBody,
  GetSessionParams,
  DeleteSessionParams,
  GetMySessionsQueryParams,
  ExportWeeklySummaryQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middleware/auth";

const router = Router();

// Application is operated in Korea; render today's date and time in
// Asia/Seoul so that scans near midnight (and any time of day on a UTC
// host) are recorded against the correct local day and clock.
const KST_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const KST_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function toTimeString(date: Date): string {
  // en-GB with hour12:false yields HH:MM:SS in 24h format.
  return KST_TIME_FMT.format(date);
}

function todayDateStr(): string {
  // en-CA yields YYYY-MM-DD.
  return KST_DATE_FMT.format(new Date());
}

function formatSession(session: typeof sessionsTable.$inferSelect, userName: string) {
  return {
    id: session.id,
    userId: session.userId,
    userName,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime ?? null,
    durationMinutes: session.durationMinutes ?? null,
    createdAt: session.createdAt.toISOString(),
  };
}

// Resolve the Monday (KST) of the week containing `dateStr` (YYYY-MM-DD).
// Returns YYYY-MM-DD for that Monday.
function weekMondayKst(dateStr: string): string {
  // Anchor at noon KST (UTC+9 -> 03:00Z) to avoid DST edge cases.
  const anchor = new Date(`${dateStr}T03:00:00Z`);
  // getUTCDay: Sun=0, Mon=1, ... Sat=6
  const dow = anchor.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - daysSinceMonday);
  return KST_DATE_FMT.format(anchor);
}

function addDaysKst(dateStr: string, days: number): string {
  const anchor = new Date(`${dateStr}T03:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return KST_DATE_FMT.format(anchor);
}

// Strict calendar validation: reject impossible dates like 2026-02-31 that
// a plain `new Date()` would silently roll forward to a different month.
function isStrictCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

router.get("/sessions/weekly-export.xlsx", requireAdmin, async (req, res): Promise<void> => {
  const parsedQuery = ExportWeeklySummaryQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "weekStart 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }

  const rawWeekStart = parsedQuery.data.weekStart;
  // The generated query schema only enforces "a string"; reject impossible
  // calendar dates (e.g. 2026-02-31) that would otherwise roll forward silently.
  if (rawWeekStart != null && rawWeekStart !== "" && !isStrictCalendarDate(rawWeekStart)) {
    res.status(400).json({ error: "weekStart 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }

  let weekStart: string;
  if (rawWeekStart) {
    // Snap to Monday of the chosen week so the export is always a full week.
    weekStart = weekMondayKst(rawWeekStart);
  } else {
    weekStart = weekMondayKst(todayDateStr());
  }
  const weekEnd = addDaysKst(weekStart, 6);

  // Pull all completed sessions in the window, joined with the user. We
  // exclude open sessions (no endTime) so durations are well-defined.
  const rows = await db
    .select({
      userId: sessionsTable.userId,
      userName: usersTable.name,
      date: sessionsTable.date,
      durationMinutes: sessionsTable.durationMinutes,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        gte(sessionsTable.date, weekStart),
        lte(sessionsTable.date, weekEnd),
        isNotNull(sessionsTable.endTime),
      ),
    )
    .orderBy(usersTable.name, sessionsTable.date);

  // Aggregate per user: minutes per weekday + visit counts.
  type UserAgg = {
    name: string;
    perDayMinutes: number[]; // index 0=Mon ... 6=Sun
    perDayVisits: number[];
  };
  const byUser = new Map<number, UserAgg>();
  for (const r of rows) {
    let agg = byUser.get(r.userId);
    if (!agg) {
      agg = { name: r.userName, perDayMinutes: [0, 0, 0, 0, 0, 0, 0], perDayVisits: [0, 0, 0, 0, 0, 0, 0] };
      byUser.set(r.userId, agg);
    }
    // Day offset 0..6 from weekStart
    const ms = new Date(`${r.date}T03:00:00Z`).getTime() - new Date(`${weekStart}T03:00:00Z`).getTime();
    const idx = Math.round(ms / (24 * 60 * 60 * 1000));
    if (idx < 0 || idx > 6) continue;
    agg.perDayMinutes[idx] += r.durationMinutes ?? 0;
    agg.perDayVisits[idx] += 1;
  }

  const dayHeaders = ["월", "화", "수", "목", "금", "토", "일"].map(
    (label, i) => `${label} (${addDaysKst(weekStart, i).slice(5)})`,
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "QR 이용 관리";
  wb.created = new Date();
  const ws = wb.addWorksheet(`주간 요약 ${weekStart}`);

  ws.columns = [
    { header: "이용자", key: "name", width: 18 },
    ...dayHeaders.map((h, i) => ({ header: h, key: `d${i}`, width: 12 })),
    { header: "주간 합계(분)", key: "totalMin", width: 14 },
    { header: "주간 합계(시간)", key: "totalHr", width: 16 },
    { header: "방문 일수", key: "daysVisited", width: 10 },
    { header: "방문 횟수", key: "visitCount", width: 10 },
  ];

  // Header row styling
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  const sortedUsers = Array.from(byUser.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ko"),
  );

  for (const u of sortedUsers) {
    const totalMin = u.perDayMinutes.reduce((s, n) => s + n, 0);
    const totalVisits = u.perDayVisits.reduce((s, n) => s + n, 0);
    const daysVisited = u.perDayVisits.filter((n) => n > 0).length;
    const row: Record<string, string | number> = {
      name: u.name,
      totalMin,
      totalHr: Math.round((totalMin / 60) * 100) / 100,
      daysVisited,
      visitCount: totalVisits,
    };
    for (let i = 0; i < 7; i += 1) {
      row[`d${i}`] = u.perDayMinutes[i];
    }
    ws.addRow(row);
  }

  if (sortedUsers.length === 0) {
    ws.addRow({ name: "해당 주에 완료된 이용 기록이 없습니다." });
  }

  // Totals row
  if (sortedUsers.length > 0) {
    const totalsRow: Record<string, string | number> = { name: "합계" };
    let grand = 0;
    for (let i = 0; i < 7; i += 1) {
      const sum = sortedUsers.reduce((s, u) => s + u.perDayMinutes[i], 0);
      totalsRow[`d${i}`] = sum;
      grand += sum;
    }
    totalsRow["totalMin"] = grand;
    totalsRow["totalHr"] = Math.round((grand / 60) * 100) / 100;
    totalsRow["daysVisited"] = "";
    totalsRow["visitCount"] = sortedUsers.reduce(
      (s, u) => s + u.perDayVisits.reduce((a, b) => a + b, 0),
      0,
    );
    const added = ws.addRow(totalsRow);
    added.font = { bold: true };
    added.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F7" } };
      cell.border = { top: { style: "thin" } };
    });
  }

  // Title banner row above headers (insert)
  ws.spliceRows(1, 0, [`이용자 주간 이용 현황 (${weekStart} ~ ${weekEnd})`]);
  ws.mergeCells(1, 1, 1, 12);
  const titleCell = ws.getCell(1, 1);
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `weekly-summary-${weekStart}.xlsx`;
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

router.get("/sessions/summary", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      date: sessionsTable.date,
      totalSessions: sql<number>`count(*)::int`,
      completedSessions: sql<number>`count(case when ${sessionsTable.endTime} is not null then 1 end)::int`,
      activeSessions: sql<number>`count(case when ${sessionsTable.endTime} is null then 1 end)::int`,
      avgDurationMinutes: sql<number | null>`round(avg(${sessionsTable.durationMinutes}))::int`,
    })
    .from(sessionsTable)
    .groupBy(sessionsTable.date)
    .orderBy(desc(sessionsTable.date));

  res.json(rows);
});

router.get("/sessions/mine", async (req, res): Promise<void> => {
  const accountId = req.session.accountId;
  if (!accountId) {
    res.status(401).json({ error: "로그인이 필요합니다" });
    return;
  }

  const parsed = GetMySessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date: dateFilter, month: monthFilter, from: fromFilter, to: toFilter } = parsed.data;

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTH_RE = /^\d{4}-\d{2}$/;
  const isValidDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
  const isValidMonth = (s: string) => MONTH_RE.test(s);

  if (dateFilter && !isValidDate(dateFilter)) {
    res.status(400).json({ error: "date 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }
  if (monthFilter && !isValidMonth(monthFilter)) {
    res.status(400).json({ error: "month 형식이 올바르지 않습니다 (YYYY-MM)" });
    return;
  }
  if (fromFilter && !isValidDate(fromFilter)) {
    res.status(400).json({ error: "from 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }
  if (toFilter && !isValidDate(toFilter)) {
    res.status(400).json({ error: "to 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }
  if (fromFilter && toFilter && fromFilter > toFilter) {
    res.status(400).json({ error: "from은 to보다 이후일 수 없습니다" });
    return;
  }

  // Strict identity: only sessions belonging to the user explicitly linked to this account.
  const [linkedUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.accountId, accountId));

  if (!linkedUser) {
    res.json([]);
    return;
  }

  const filters = [eq(sessionsTable.userId, linkedUser.id)];
  if (dateFilter) filters.push(eq(sessionsTable.date, dateFilter));
  if (monthFilter) filters.push(sql`to_char(${sessionsTable.date}, 'YYYY-MM') = ${monthFilter}`);
  if (fromFilter) filters.push(sql`${sessionsTable.date} >= ${fromFilter}`);
  if (toFilter) filters.push(sql`${sessionsTable.date} <= ${toFilter}`);

  const rows = await db
    .select({ session: sessionsTable, userName: usersTable.name })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(...filters))
    .orderBy(desc(sessionsTable.date), desc(sessionsTable.startTime));

  res.json(rows.map((r) => formatSession(r.session, r.userName)));
});

function csvEscape(value: unknown): string {
  if (value == null) return "";
  let s = typeof value === "string" ? value : String(value);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/sessions/mine/export.csv", async (req, res): Promise<void> => {
  const accountId = req.session.accountId;
  if (!accountId) {
    res.status(401).json({ error: "로그인이 필요합니다" });
    return;
  }

  const parsed = GetMySessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date: dateFilter, month: monthFilter, from: fromFilter, to: toFilter } = parsed.data;

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTH_RE = /^\d{4}-\d{2}$/;
  const isValidDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
  const isValidMonth = (s: string) => MONTH_RE.test(s);

  if (dateFilter && !isValidDate(dateFilter)) {
    res.status(400).json({ error: "date 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }
  if (monthFilter && !isValidMonth(monthFilter)) {
    res.status(400).json({ error: "month 형식이 올바르지 않습니다 (YYYY-MM)" });
    return;
  }
  if (fromFilter && !isValidDate(fromFilter)) {
    res.status(400).json({ error: "from 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }
  if (toFilter && !isValidDate(toFilter)) {
    res.status(400).json({ error: "to 형식이 올바르지 않습니다 (YYYY-MM-DD)" });
    return;
  }
  if (fromFilter && toFilter && fromFilter > toFilter) {
    res.status(400).json({ error: "from은 to보다 이후일 수 없습니다" });
    return;
  }

  const [linkedUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.accountId, accountId));

  const header = ["날짜", "체크인", "체크아웃", "이용 시간(분)", "상태"];
  const lines = [header.join(",")];

  if (linkedUser) {
    const filters = [eq(sessionsTable.userId, linkedUser.id)];
    if (dateFilter) filters.push(eq(sessionsTable.date, dateFilter));
    if (monthFilter) filters.push(sql`to_char(${sessionsTable.date}, 'YYYY-MM') = ${monthFilter}`);
    if (fromFilter) filters.push(sql`${sessionsTable.date} >= ${fromFilter}`);
    if (toFilter) filters.push(sql`${sessionsTable.date} <= ${toFilter}`);

    const rows = await db
      .select({ session: sessionsTable })
      .from(sessionsTable)
      .where(and(...filters))
      .orderBy(desc(sessionsTable.date), desc(sessionsTable.startTime));

    for (const { session } of rows) {
      lines.push([
        csvEscape(session.date),
        csvEscape(session.startTime),
        csvEscape(session.endTime ?? ""),
        csvEscape(session.durationMinutes ?? ""),
        csvEscape(session.endTime ? "완료" : "이용중"),
      ].join(","));
    }
  }

  let filename = "my-sessions";
  if (monthFilter) filename += `-${monthFilter}`;
  else if (dateFilter) filename += `-${dateFilter}`;
  else if (fromFilter || toFilter) filename += `-${fromFilter ?? ""}_${toFilter ?? ""}`;
  else filename += `-${new Date().toISOString().slice(0, 10)}`;
  filename += ".csv";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("\uFEFF" + lines.join("\n"));
});

// "Today" view is shown to anyone operating the QR scanner (staff as well as
// admins). Admins see every user's session; staff only see sessions for users
// assigned to them (users.account_id === session.accountId).
router.get("/sessions/today", async (req, res): Promise<void> => {
  const today = todayDateStr();
  const role = req.session.role;
  const accountId = req.session.accountId;

  const filters = [eq(sessionsTable.date, today)];
  if (role !== "admin") {
    if (!accountId) {
      res.json([]);
      return;
    }
    filters.push(eq(usersTable.accountId, accountId));
  }

  const rows = await db
    .select({
      session: sessionsTable,
      userName: usersTable.name,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(...filters))
    .orderBy(desc(sessionsTable.createdAt));

  res.json(rows.map((r) => formatSession(r.session, r.userName)));
});

router.get("/sessions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListSessionsQueryParams.safeParse(req.query);
  const filters = [];
  let limit = 50;
  let offset = 0;
  if (parsed.success) {
    if (parsed.data.date) filters.push(eq(sessionsTable.date, parsed.data.date));
    if (parsed.data.userId) filters.push(eq(sessionsTable.userId, parsed.data.userId));
    if (parsed.data.limit != null) limit = Math.min(Math.max(1, parsed.data.limit), 200);
    if (parsed.data.offset != null) offset = Math.max(0, parsed.data.offset);
  }

  const whereExpr = filters.length > 0 ? and(...filters) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(whereExpr);

  const rows = await db
    .select({
      session: sessionsTable,
      userName: usersTable.name,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(whereExpr)
    .orderBy(desc(sessionsTable.date), desc(sessionsTable.startTime))
    .limit(limit)
    .offset(offset);

  res.json({
    total: count,
    items: rows.map((r) => formatSession(r.session, r.userName)),
  });
});

router.post("/sessions/checkin", async (req, res): Promise<void> => {
  const parsed = CheckInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.qrCode, parsed.data.qrCode));

  if (!user) {
    res.status(400).json({ error: "QR 코드를 찾을 수 없습니다" });
    return;
  }

  // Strict ownership: a staff member may only scan QR codes for users
  // assigned to them. Admins can scan any user.
  if (req.session.role !== "admin" && user.accountId !== req.session.accountId) {
    res.status(403).json({ error: "담당하는 이용자가 아닙니다" });
    return;
  }

  const today = todayDateStr();
  const existing = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, user.id),
        eq(sessionsTable.date, today),
        sql`${sessionsTable.endTime} is null`
      )
    );

  if (existing.length > 0) {
    res.status(400).json({ error: "이미 체크인 중입니다" });
    return;
  }

  const now = new Date();
  const [session] = await db
    .insert(sessionsTable)
    .values({
      userId: user.id,
      date: today,
      startTime: toTimeString(now),
    })
    .returning();

  res.status(201).json(formatSession(session, user.name));
});

router.post("/sessions/checkout", async (req, res): Promise<void> => {
  const parsed = CheckOutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.qrCode, parsed.data.qrCode));

  if (!user) {
    res.status(400).json({ error: "QR 코드를 찾을 수 없습니다" });
    return;
  }

  // Strict ownership: a staff member may only scan QR codes for users
  // assigned to them. Admins can scan any user.
  if (req.session.role !== "admin" && user.accountId !== req.session.accountId) {
    res.status(403).json({ error: "담당하는 이용자가 아닙니다" });
    return;
  }

  const today = todayDateStr();
  const [activeSession] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, user.id),
        eq(sessionsTable.date, today),
        sql`${sessionsTable.endTime} is null`
      )
    );

  if (!activeSession) {
    res.status(400).json({ error: "체크인 기록이 없습니다" });
    return;
  }

  const now = new Date();
  const endTimeStr = toTimeString(now);

  // Calculate duration in minutes
  const [startH, startM] = activeSession.startTime.split(":").map(Number);
  const [endH, endM] = endTimeStr.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const durationMinutes = Math.max(0, endMinutes - startMinutes);

  const [updated] = await db
    .update(sessionsTable)
    .set({ endTime: endTimeStr, durationMinutes })
    .where(eq(sessionsTable.id, activeSession.id))
    .returning();

  res.json(formatSession(updated, user.name));
});

router.get("/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GetSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select({ session: sessionsTable, userName: usersTable.name })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.id, parsed.data.id));

  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(formatSession(row.session, row.userName));
});

router.delete("/sessions/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = DeleteSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
