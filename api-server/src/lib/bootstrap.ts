import bcrypt from "bcryptjs";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { recordPasswordHistory } from "./password";

/**
 * Optionally seed an initial admin account on startup.
 *
 * Credentials are read from environment variables and are NEVER hardcoded. If
 * the required variables are not set, bootstrapping is skipped entirely — this
 * is the normal case once an admin account already exists in the database.
 *
 * To provision a fresh deployment, set:
 *   BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD
 *   BOOTSTRAP_ADMIN_DISPLAY_NAME (optional, defaults to "관리자")
 *
 * Recovery: if the admin already exists but you are locked out, also set
 *   BOOTSTRAP_ADMIN_RESET=true
 * to reset that admin's password to BOOTSTRAP_ADMIN_PASSWORD on the next
 * startup. This is a deliberate, env-gated action: remove the flag (and the
 * other BOOTSTRAP_ADMIN_* vars) once you have regained access, otherwise every
 * subsequent restart will reset the password again.
 */
export async function ensureDefaultAdmin(): Promise<void> {
  const username = process.env["BOOTSTRAP_ADMIN_USERNAME"]?.trim();
  const password = process.env["BOOTSTRAP_ADMIN_PASSWORD"];
  const displayName = process.env["BOOTSTRAP_ADMIN_DISPLAY_NAME"]?.trim() || "관리자";
  const resetExisting = process.env["BOOTSTRAP_ADMIN_RESET"] === "true";

  if (!username || !password) {
    logger.info("No BOOTSTRAP_ADMIN_* env vars set; skipping admin bootstrap");
    return;
  }

  try {
    const [existing] = await db
      .select({ id: accountsTable.id, role: accountsTable.role })
      .from(accountsTable)
      .where(eq(accountsTable.username, username))
      .limit(1);

    if (existing) {
      if (!resetExisting) {
        logger.info({ username }, "Admin account already exists; skipping bootstrap");
        return;
      }

      // Safety: only reset accounts that are ALREADY admins. Never promote a
      // staff account to admin via this recovery path.
      if (existing.role !== "admin") {
        logger.warn(
          { username },
          "BOOTSTRAP_ADMIN_RESET set but target account is not an admin; refusing to reset",
        );
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await db
        .update(accountsTable)
        .set({ passwordHash, passwordUpdatedAt: new Date() })
        .where(eq(accountsTable.id, existing.id));
      await recordPasswordHistory(existing.id, passwordHash);

      logger.warn(
        { username, id: existing.id },
        "Reset existing admin password from env vars (BOOTSTRAP_ADMIN_RESET=true)",
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [account] = await db
      .insert(accountsTable)
      .values({
        username,
        passwordHash,
        displayName,
        role: "admin",
        passwordUpdatedAt: new Date(),
      })
      .returning();

    await recordPasswordHistory(account.id, passwordHash);

    logger.warn({ username, id: account.id }, "Bootstrapped admin account from env vars");
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap admin account");
  }
}
