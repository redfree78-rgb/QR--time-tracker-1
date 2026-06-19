import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
const router = Router();

// IP-based rate limiter for the login endpoint.
// Allows up to 10 attempts per 15 minutes per IP before returning 429.
// Uses the default in-memory store, which is appropriate for the current
// single-process deployment. If the app is ever scaled to multiple
// instances, replace the store with a shared backend (e.g. Redis).
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요." },
  skipSuccessfulRequests: true,
});

function getClientIp(req: import("express").Request): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf.length > 0) return xf[0];
  return req.ip ?? null;
}

// POST /auth/login
router.post("/auth/login", loginRateLimiter, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "아이디와 비밀번호를 입력해주세요" });
    return;
  }
  const { username, password } = parsed.data;

  const ip = getClientIp(req);

  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.username, username))
    .limit(1);

  if (!account) {
    await recordAudit(req, {
      action: "auth.login_failure",
      targetType: "account",
      targetId: null,
      details: { username, ip, reason: "unknown_user" },
    });
    res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다" });
    return;
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    await recordAudit(req, {
      action: "auth.login_failure",
      targetType: "account",
      targetId: account.id,
      details: { username, ip, reason: "bad_password" },
    });
    res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다" });
    return;
  }

  req.session.accountId = account.id;
  req.session.username = account.username;
  req.session.role = account.role;
  req.session.displayName = account.displayName;

  await recordAudit(req, {
    action: "auth.login_success",
    targetType: "account",
    targetId: account.id,
    details: { username: account.username, displayName: account.displayName, role: account.role, ip },
  });

  res.json({
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    passwordUpdatedAt: account.passwordUpdatedAt?.toISOString() ?? null,
  });
});

// POST /auth/logout
router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  const [account] = await db
    .select({
      passwordUpdatedAt: accountsTable.passwordUpdatedAt,
    })
    .from(accountsTable)
    .where(eq(accountsTable.id, req.session.accountId!))
    .limit(1);

  res.json({
    id: req.session.accountId,
    username: req.session.username,
    displayName: req.session.displayName,
    role: req.session.role,
    passwordUpdatedAt: account?.passwordUpdatedAt?.toISOString() ?? null,
  });
});

export default router;
