import { Router } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, usersTable } from "@workspace/db";
import {
  CreateUserBody,
  GetUserParams,
  DeleteUserParams,
  UpdateUserBody,
  UpdateUserParams,
  ListUsersResponse,
  GetUserResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middleware/auth";

const router = Router();

// All user management routes are admin-only.
// Apply with the "/users" path filter so this middleware does not run on
// unrelated requests that pass through the parent router (e.g. /sessions/checkin).
router.use("/users", requireAdmin);

// Safety bound on this admin-only list. The frontend consumes the full set
// (the account-linking UI needs every user), so this is a defensive cap on the
// query rather than user-facing pagination — well beyond any realistic count.
const MAX_LIST = 5000;

router.get("/users", async (req, res): Promise<void> => {
  const users = await db
    .select()
    .from(usersTable)
    .orderBy(usersTable.createdAt)
    .limit(MAX_LIST);
  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    note: u.note ?? null,
    qrCode: u.qrCode,
    accountId: u.accountId ?? null,
    createdAt: u.createdAt.toISOString(),
  }));
  res.json(ListUsersResponse.parse(result));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, note, accountId } = parsed.data;
  const qrCode = `QR-${randomUUID()}`;
  const [user] = await db
    .insert(usersTable)
    .values({ name, note: note ?? null, qrCode, accountId: accountId ?? null })
    .returning();
  res.status(201).json({
    id: user.id,
    name: user.name,
    note: user.note ?? null,
    qrCode: user.qrCode,
    accountId: user.accountId ?? null,
    createdAt: user.createdAt.toISOString(),
  });
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const paramParsed = UpdateUserParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateUserBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (bodyParsed.data.name !== undefined) updates.name = bodyParsed.data.name;
  if (bodyParsed.data.note !== undefined) updates.note = bodyParsed.data.note ?? null;
  if (bodyParsed.data.accountId !== undefined) updates.accountId = bodyParsed.data.accountId ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "변경할 항목이 없습니다" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, paramParsed.data.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    note: user.note ?? null,
    qrCode: user.qrCode,
    accountId: user.accountId ?? null,
    createdAt: user.createdAt.toISOString(),
  });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const parsed = GetUserParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(
    GetUserResponse.parse({
      id: user.id,
      name: user.name,
      note: user.note ?? null,
      qrCode: user.qrCode,
      accountId: user.accountId ?? null,
      createdAt: user.createdAt.toISOString(),
    })
  );
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const parsed = DeleteUserParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
