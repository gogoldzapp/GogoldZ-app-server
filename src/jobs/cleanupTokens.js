import cron from "node-cron";
import prisma from "../config/prisma.js";
import logger from "../config/logger.js";

// Run daily at 02:00 server time
cron.schedule("0 2 * * *", async () => {
  const now = new Date();

  try {
    const revokedDeleted = await prisma.revokedRefreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    const sessionsDeleted = await prisma.userSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    logger.info(
      `[Cleanup @ ${now.toISOString()}] Deleted ${
        revokedDeleted.count
      } revoked tokens, ${sessionsDeleted.count} expired sessions`
    );
  } catch (err) {
    console.error("[Cleanup] Error deleting expired tokens/sessions:", err);
  }
});
