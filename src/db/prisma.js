// Create prisma client for DB connection

import { PrismaClient } from "@prisma/client";
//import { config } from "../config-legacy.js";
import { ILogger } from "../logger.js";
import config from "../config/index.js";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.DATABASE_URL,
    },
  },
  log:
    config.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["warn", "error"],
  errorFormat: "minimal",
});

// optional: probe on import and log a short message
export async function pingDb() {
  try {
    // Lightweight probe (Postgres: SELECT 1)
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    ILogger.error({ err }, "DB ping failed");
    return false;
  }
}
