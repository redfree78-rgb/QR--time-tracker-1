import app from "./app";
import { logger } from "./lib/logger";
import { ensureDefaultAdmin } from "./lib/bootstrap";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Best-effort: seed the default admin account on first run.  Safe to call
// repeatedly — it is a no-op when the account already exists.  Errors are
// logged but never block the server from starting.
ensureDefaultAdmin().catch((err) => {
  logger.error({ err }, "ensureDefaultAdmin threw unexpectedly");
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
