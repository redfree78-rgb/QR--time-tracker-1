import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { passwordHistoryTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export const PASSWORD_HISTORY_LIMIT = 3;
export const PASSWORD_MAX_AGE_DAYS = 90;

export type PasswordValidationError = "too_short";

// Minimum length only; no character-class complexity requirement.
// Lowered from the original 8-character + 2-class rule per user request
// to make password setup easier for staff.
export const PASSWORD_MIN_LENGTH = 6;

export function validatePasswordComplexity(
  password: string,
): PasswordValidationError | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  return null;
}

export function passwordErrorMessage(err: PasswordValidationError): string {
  switch (err) {
    case "too_short":
      return `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다`;
  }
}

export async function isPasswordReused(
  accountId: number,
  newPassword: string,
): Promise<boolean> {
  const rows = await db
    .select({ passwordHash: passwordHistoryTable.passwordHash })
    .from(passwordHistoryTable)
    .where(eq(passwordHistoryTable.accountId, accountId))
    .orderBy(desc(passwordHistoryTable.createdAt))
    .limit(PASSWORD_HISTORY_LIMIT);

  for (const row of rows) {
    if (await bcrypt.compare(newPassword, row.passwordHash)) return true;
  }
  return false;
}

export async function recordPasswordHistory(
  accountId: number,
  passwordHash: string,
): Promise<void> {
  await db.insert(passwordHistoryTable).values({ accountId, passwordHash });

  // Trim older entries beyond the retention window.
  const recent = await db
    .select({ id: passwordHistoryTable.id })
    .from(passwordHistoryTable)
    .where(eq(passwordHistoryTable.accountId, accountId))
    .orderBy(desc(passwordHistoryTable.createdAt))
    .limit(PASSWORD_HISTORY_LIMIT);
  const keepIds = new Set(recent.map((r) => r.id));
  const all = await db
    .select({ id: passwordHistoryTable.id })
    .from(passwordHistoryTable)
    .where(eq(passwordHistoryTable.accountId, accountId));
  const toDelete = all.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
  if (toDelete.length > 0) {
    for (const id of toDelete) {
      await db.delete(passwordHistoryTable).where(eq(passwordHistoryTable.id, id));
    }
  }
}
