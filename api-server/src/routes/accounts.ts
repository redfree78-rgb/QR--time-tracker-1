import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, accountsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import {
  validatePasswordComplexity,
  passwordErrorMessage,
  isPasswordReused,
  recordPasswordHistory,
} from "../lib/password";
import {
  CreateAccountBody,
  DeleteAccountParams,
  ChangePasswordParams,
  ChangePasswordBody,
  UpdateAccountBody,
  UpdateAccountParams,
} from "@workspace/api-zod";

const router = Router();

// All account routes are admin-only
// Apply admin gate only to /accounts paths so it does not block unrelated
// requests passing through the parent router.
router.use("/accounts", requireAdmin);

// Safety bound on this admin-only list. The frontend consumes the full set
// (the account-linking UI needs every account), so this is a defensive cap on
// the query rather than user-facing pagination — well beyond any realistic count.
const MAX_LIST = 5000;

// GET /accounts
router.get("/accounts", async (req, res) => {
  const rows = await db
    .select({
      id: accountsTable.id,
      username: accountsTable.username,
      displayName: accountsTable.displayName,
      role: accountsTable.role,
      position: accountsTable.position,
      createdAt: accountsTable.createdAt,
    })
    .from(accountsTable)
    .orderBy(accountsTable.createdAt)
    .limit(MAX_LIST);

  res.json(
    rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      role: r.role,
      position: r.position ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

// POST /accounts
router.post("/accounts", async (req, res) => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, password, displayName, role } = parsed.data;
  const position = parsed.data.position?.trim() || null;

  const complexityErr = validatePasswordComplexity(password);
  if (complexityErr) {
    res.status(400).json({ error: passwordErrorMessage(complexityErr) });
    return;
  }

  const [existing] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.username, username))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "이미 사용 중인 아이디입니다" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [account] = await db
    .insert(accountsTable)
    .values({
      username,
      passwordHash,
      displayName,
      role: role ?? "staff",
      position,
      passwordUpdatedAt: new Date(),
    })
    .returning();

  await recordPasswordHistory(account.id, passwordHash);

  await recordAudit(req, {
    action: "account.create",
    targetType: "account",
    targetId: account.id,
    details: {
      username: account.username,
      displayName: account.displayName,
      role: account.role,
    },
  });

  res.status(201).json({
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    position: account.position ?? null,
    createdAt: account.createdAt.toISOString(),
  });
});

// PATCH /accounts/:id — update display name
router.patch("/accounts/:id", async (req, res) => {
  const parsedParams = UpdateAccountParams.safeParse({ id: Number(req.params.id) });
  const parsedBody = UpdateAccountBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "입력값이 올바르지 않습니다" });
    return;
  }
  const { id } = parsedParams.data;
  const displayName = parsedBody.data.displayName.trim();
  if (!displayName) {
    res.status(400).json({ error: "표시 이름을 입력해주세요" });
    return;
  }
  // `position` is optional: undefined means "leave unchanged", any provided
  // value (including empty) sets/clears the assigned position.
  const positionProvided = parsedBody.data.position !== undefined;
  const newPosition = positionProvided
    ? parsedBody.data.position?.trim() || null
    : undefined;

  const [target] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "계정을 찾을 수 없습니다" });
    return;
  }

  const positionUnchanged = !positionProvided || target.position === newPosition;
  if (target.displayName === displayName && positionUnchanged) {
    res.json({
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      role: target.role,
      position: target.position ?? null,
      createdAt: target.createdAt.toISOString(),
    });
    return;
  }

  const previousDisplayName = target.displayName;
  const [updated] = await db
    .update(accountsTable)
    .set({
      displayName,
      ...(positionProvided ? { position: newPosition } : {}),
    })
    .where(eq(accountsTable.id, id))
    .returning();

  // Keep the active session's displayName in sync if the admin renamed
  // themselves, so the header/menu doesn't show a stale name.
  if (req.session.accountId === id) {
    req.session.displayName = displayName;
  }

  await recordAudit(req, {
    action: "account.update",
    targetType: "account",
    targetId: id,
    details: {
      username: updated.username,
      displayName: updated.displayName,
      previousDisplayName,
      role: updated.role,
      position: updated.position ?? null,
    },
  });

  res.json({
    id: updated.id,
    username: updated.username,
    displayName: updated.displayName,
    role: updated.role,
    position: updated.position ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

// DELETE /accounts/:id
router.delete("/accounts/:id", async (req, res) => {
  const parsed = DeleteAccountParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { id } = parsed.data;

  // Prevent self-deletion
  if (req.session.accountId === id) {
    res.status(403).json({ error: "본인 계정은 삭제할 수 없습니다" });
    return;
  }

  // Prevent deleting the last admin
  const [target] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "계정을 찾을 수 없습니다" });
    return;
  }

  if (target.role === "admin") {
    const [adminCount] = await db
      .select({ count: count() })
      .from(accountsTable)
      .where(eq(accountsTable.role, "admin"));
    if (adminCount && adminCount.count <= 1) {
      res.status(403).json({ error: "마지막 관리자 계정은 삭제할 수 없습니다" });
      return;
    }
  }

  await db.delete(accountsTable).where(eq(accountsTable.id, id));

  await recordAudit(req, {
    action: "account.delete",
    targetType: "account",
    targetId: id,
    details: {
      username: target.username,
      displayName: target.displayName,
      role: target.role,
    },
  });

  res.status(204).send();
});

// PUT /accounts/:id/password
router.put("/accounts/:id/password", async (req, res) => {
  const parsedParams = ChangePasswordParams.safeParse({
    id: Number(req.params.id),
  });
  const parsedBody = ChangePasswordBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "입력값이 오류입니다" });
    return;
  }
  const { id } = parsedParams.data;
  const { password } = parsedBody.data;

  const complexityErr = validatePasswordComplexity(password);
  if (complexityErr) {
    res.status(400).json({ error: passwordErrorMessage(complexityErr) });
    return;
  }

  const [target] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "계정을 찾을 수 없습니다" });
    return;
  }

  if (await bcrypt.compare(password, target.passwordHash)) {
    res.status(400).json({ error: "기존 비밀번호와 동일하게 설정할 수 없습니다" });
    return;
  }

  if (await isPasswordReused(id, password)) {
    res.status(400).json({ error: "최근에 사용한 비밀번호는 재사용할 수 없습니다 (최근 3개)" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .update(accountsTable)
    .set({ passwordHash, passwordUpdatedAt: new Date() })
    .where(eq(accountsTable.id, id));

  await recordPasswordHistory(id, passwordHash);

  await recordAudit(req, {
    action: "account.password_change",
    targetType: "account",
    targetId: id,
    details: {
      username: target.username,
      displayName: target.displayName,
    },
  });

  res.status(204).send();
});

export default router;
