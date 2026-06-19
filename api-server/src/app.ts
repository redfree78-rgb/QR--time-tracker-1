import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import "./types/session.d";

const PgSession = connectPgSimple(session);

const app: Express = express();

// Behind Replit's reverse proxy — trust exactly one proxy hop so req.ip
// reflects the real client IP from X-Forwarded-For without allowing
// spoofing via client-supplied headers further down the chain.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Build an explicit allowlist from REPLIT_DOMAINS (comma-separated list of
// production hostnames provided by the platform) plus REPLIT_DEV_DOMAIN
// (the workspace preview hostname used inside the Replit editor iframe).
// Including the dev domain lets the user log in from the workspace preview
// while still rejecting arbitrary external origins.
const allowedOrigins: Set<string> = new Set(
  [
    ...(process.env["REPLIT_DOMAINS"] ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
    ...(process.env["REPLIT_DEV_DOMAIN"] ? [process.env["REPLIT_DEV_DOMAIN"]] : []),
  ].map((h) => `https://${h}`),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin requests (origin === undefined) are always permitted.
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: false,
      // Session cookies have no maxAge, so give the DB row an explicit TTL
      // (in seconds) instead of relying on the cookie expiry.
      ttl: 24 * 60 * 60,
    }),
    secret: process.env["SESSION_SECRET"] ?? "fallback-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      // No maxAge/expires -> browser-session cookie: it is cleared when the
      // browser (or mobile app) is fully closed, so there is no auto-login.
      // Reopening the deployed app returns to the login screen and the
      // employee must enter their id/password again.
      // "lax" is correct for both dev and production: the frontend and API
      // share the same domain through the Replit proxy, so cookies are always
      // sent on same-site navigations.  "none" would allow the browser to
      // attach the session cookie on arbitrary cross-site requests, which is
      // the mechanism the CORS vulnerability exploits.
      sameSite: "lax",
    },
  }),
);

app.use("/api", router);

export default app;
