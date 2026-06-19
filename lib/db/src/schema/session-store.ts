import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

// Session store table owned by connect-pg-simple (express-session).
// It is modeled here ONLY so `drizzle-kit push` recognizes the existing table
// and does not try to drop or rename it during migrations. Application code
// must not read from or write to this table directly.
export const userSessionsTable = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (table) => [index("IDX_user_sessions_expire").on(table.expire)]
);
