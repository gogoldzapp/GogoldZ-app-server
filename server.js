"use strict";

import app from "./src/app.js";
import prisma from "./src/config/prisma.js";
import config from "./src/config/index.js";
import "./src/jobs/cleanupTokens.js";
import "./src/jobs/cleanupOtps.js";

const PORT = config.port;

async function startServer() {
  try {
    // Optional: test DB connection
    await prisma.$connect();
    console.log("✅ PostgreSQL (Prisma) connected");

    app.listen(PORT, "localhost", () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Prisma connection error:", err);
    process.exit(1);
  }
}

startServer();
// Handle graceful shutdown
async function shutdown(signal) {
  try {
    logger.warn({ signal }, "Shutting down...");
    server.close(() => logger.info("HTTP server closed"));
    await prisma.$disconnect();
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
  } finally {
    process.exit(0);
  }
}

["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));
// Error handling
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});