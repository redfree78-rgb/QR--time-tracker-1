import { Router } from "express";
import { db, positionsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";
import { CreatePositionBody, DeletePositionParams } from "@workspace/api-zod";

const router = Router();

// All position routes are admin-only. Scope the gate to /positions so it does
// not affect unrelated requests passing through the parent router.
router.use("/positions", requireAdmin);

// Defensive cap; the position list is a small admin-managed set.
const MAX_LIST = 1000;

// GET /positions
router.get("/positions", async (_req, res) => {
  const rows = await db
    .select({
      id: positionsTable.id,
      name: positionsTable.name,
      createdAt: positionsTable.createdAt,
    })
    .from(positionsTable)
    .orderBy(asc(positionsTable.name))
    .limit(MAX_LIST);

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

// POST /positions
router.post("/positions", async (req, res) => {
  const parsed = CreatePositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "직위 이름을 입력해주세요" });
    return;
  }

  const [existing] = await db
    .select()
    .from(positionsTable)
    .where(eq(positionsTable.name, name))
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "이미 등록된 직위입니다" });
    return;
  }

  const [position] = await db
    .insert(positionsTable)
    .values({ name })
    .returning();

  res.status(201).json({
    id: position.id,
    name: position.name,
    createdAt: position.createdAt.toISOString(),
  });
});

// DELETE /positions/:id
router.delete("/positions/:id", async (req, res) => {
  const parsed = DeletePositionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { id } = parsed.data;

  const [target] = await db
    .select()
    .from(positionsTable)
    .where(eq(positionsTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "직위를 찾을 수 없습니다" });
    return;
  }

  await db.delete(positionsTable).where(eq(positionsTable.id, id));

  res.status(204).send();
});

export default router;
