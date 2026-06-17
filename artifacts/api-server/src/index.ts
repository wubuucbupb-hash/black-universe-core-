import app from "./app";
import { logger } from "./lib/logger";
import { ensureAdmin } from "./lib/ensureAdmin";
import { ensureSystemAccounts } from "./lib/ensureSystemAccounts";
import { flushPendingFees } from "./lib/matrixEngine";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

Promise.all([ensureAdmin(), ensureSystemAccounts()])
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");

      // P3: batch-aggregate buffered system-pool fees every 60s. Each tick
      // sums the pending_fees buffer into the pool accounts in one atomic
      // write, instead of contending the hot pool row on every transaction.
      const FEE_FLUSH_INTERVAL_MS = 60_000;
      setInterval(() => {
        flushPendingFees()
          .then(({ flushed, pools }) => {
            if (flushed > 0) {
              logger.info({ flushed, pools }, "Flushed pending pool fees");
            }
          })
          .catch((flushErr) => {
            logger.error({ err: flushErr }, "Pending-fee flush failed");
          });
      }, FEE_FLUSH_INTERVAL_MS);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup initialization failed — aborting");
    process.exit(1);
  });
