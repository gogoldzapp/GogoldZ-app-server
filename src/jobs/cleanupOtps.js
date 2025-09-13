// src/jobs/cleanupOtps.js
// Purpose: Safely clean up OTP challenges to keep the table lean and private.
// Run daily via cron or your scheduler. Idempotent + batched + dry-run support.
import prisma from "../config/prisma.js";

/**
 * Cleanup policy (tweak via env if you like):
 * - consumed OTPs older than 24h -> delete
 * - unconsumed but expired OTPs -> delete
 * - hard cap retention (e.g., 7d) -> delete regardless of state (optional)
 */
const HOURS_AFTER_CONSUMED_DELETE = parseInt(
  process.env.OTP_CLEAN_CONSUMED_AFTER_HOURS || "24",
  10
);
const HARD_RETENTION_DAYS = parseInt(
  process.env.OTP_CLEAN_HARD_RETENTION_DAYS || "7",
  10
);
const BATCH_SIZE = parseInt(process.env.OTP_CLEAN_BATCH_SIZE || "1000", 10);
const DRY_RUN =
  (process.env.OTP_CLEAN_DRY_RUN || "false").toLowerCase() === "true";

function subHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() - hours);
  return d;
}
function subDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

export async function cleanupOtpChallenges() {
  const now = new Date();
  const consumedCutoff = subHours(now, HOURS_AFTER_CONSUMED_DELETE);
  const hardCutoff = subDays(now, HARD_RETENTION_DAYS);

  let totalToDelete = 0;
  let totalDeleted = 0;

  // 1) Count candidates (so logs show impact)
  const [consumedOldCount, expiredCount, hardCapCount] = await Promise.all([
    prisma.otpChallenge.count({
      where: { consumedAt: { not: null }, createdAt: { lt: consumedCutoff } },
    }),
    prisma.otpChallenge.count({
      where: { consumedAt: null, expiresAt: { lt: now } },
    }),
    prisma.otpChallenge.count({
      where: { createdAt: { lt: hardCutoff } },
    }),
  ]);

  // Hard cap can overlap with the above; we’ll dedupe by IDs when selecting
  totalToDelete = consumedOldCount + expiredCount + hardCapCount;

  console.log("[cleanupOtpChallenges] candidates:", {
    consumedOldCount,
    expiredCount,
    hardCapCount,
    totalToDelete,
    DRY_RUN,
  });

  if (DRY_RUN) {
    console.log(
      "[cleanupOtpChallenges] DRY_RUN=true => no deletions performed."
    );
    return {
      consumedOldCount,
      expiredCount,
      hardCapCount,
      totalDeleted: 0,
      dryRun: true,
    };
  }

  // 2) Collect IDs in batches so we don’t lock big ranges
  async function fetchIds(where, take = BATCH_SIZE) {
    const rows = await prisma.otpChallenge.findMany({
      select: { id: true },
      where,
      take,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.id);
  }

  // Helper to delete by IDs (batched)
  async function deleteIds(ids) {
    if (!ids.length) return 0;
    const result = await prisma.otpChallenge.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count || 0;
  }

  // Because conditions may overlap, keep a local Set to avoid double deletion
  const toDelete = new Set();

  // a) consumed + old
  while (true) {
    const ids = await fetchIds({
      consumedAt: { not: null },
      createdAt: { lt: consumedCutoff },
    });
    ids.forEach((id) => toDelete.add(id));
    if (ids.length < BATCH_SIZE) break;
  }

  // b) expired + unconsumed
  while (true) {
    const ids = await fetchIds({ consumedAt: null, expiresAt: { lt: now } });
    ids.forEach((id) => toDelete.add(id));
    if (ids.length < BATCH_SIZE) break;
  }

  // c) hard retention (any state)
  while (true) {
    const ids = await fetchIds({ createdAt: { lt: hardCutoff } });
    ids.forEach((id) => toDelete.add(id));
    if (ids.length < BATCH_SIZE) break;
  }

  // 3) Delete in chunks
  const allIds = Array.from(toDelete);
  console.log("[cleanupOtpChallenges] unique IDs to delete:", allIds.length);

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    const deleted = await deleteIds(batch);
    totalDeleted += deleted;
    console.log(
      `[cleanupOtpChallenges] deleted batch ${i / BATCH_SIZE + 1}: ${deleted}`
    );
  }

  console.log("[cleanupOtpChallenges] done:", { totalDeleted });
  return {
    totalDeleted,
    consumedOldCount,
    expiredCount,
    hardCapCount,
    dryRun: false,
  };
}

// Optional: small runner so you can `node src/jobs/cleanupOtps.js`
if (process.argv[1] && process.argv[1].endsWith("cleanupOtps.js")) {
  cleanupOtpChallenges().catch((err) => {
    console.error("[cleanupOtpChallenges] error:", err);
    process.exitCode = 1;
  });
}
