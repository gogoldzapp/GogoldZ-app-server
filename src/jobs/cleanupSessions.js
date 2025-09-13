/**
 * Expires sessions past expiresAt
 *
 * Purges long-revoked sessions
 *
 * Prunes old RevokedRefreshToken hashes
 *
 * Batched + dry-run safe
 */

import prisma from "../config/prisma.js";

const BATCH = parseInt(process.env.SESS_CLEAN_BATCH_SIZE || "1000", 10);
const SESSION_MAX_AGE_DAYS = parseInt(
  process.env.SESSION_MAX_AGE_DAYS || "90",
  10
); // hard cap
const REVOKED_GRACE_DAYS = parseInt(
  process.env.SESS_REVOKED_GRACE_DAYS || "30",
  10
); // keep revoked this long
const RT_HASH_TTL_DAYS = parseInt(process.env.RT_HASH_TTL_DAYS || "45", 10); // reuse detection retention
const DRY =
  (process.env.SESS_CLEAN_DRY_RUN || "false").toLowerCase() === "true";

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

export async function cleanupSessions() {
  const now = new Date();
  const sessionHardCutoff = daysAgo(SESSION_MAX_AGE_DAYS);
  const sessionRevokedCutoff = daysAgo(REVOKED_GRACE_DAYS);
  const rtCutoff = daysAgo(RT_HASH_TTL_DAYS);

  // Count candidates
  const [expired, revokedOld, tooOld, oldHashes] = await Promise.all([
    prisma.userSession.count({ where: { expiresAt: { lt: now } } }),
    prisma.userSession.count({
      where: { revokedAt: { lt: sessionRevokedCutoff } },
    }),
    prisma.userSession.count({
      where: { createdAt: { lt: sessionHardCutoff } },
    }),
    prisma.revokedRefreshToken.count({
      where: { createdAt: { lt: rtCutoff } },
    }),
  ]);

  console.log("[cleanupSessions] candidates:", {
    expired,
    revokedOld,
    tooOld,
    oldHashes,
    DRY,
  });

  if (DRY)
    return { expired, revokedOld, tooOld, oldHashes, deleted: 0, dryRun: true };

  let deleted = 0;

  // Delete in batches helper
  async function batchedDelete(where, model) {
    while (true) {
      const ids = await prisma[model].findMany({
        where,
        select: { id: true },
        take: BATCH,
      });
      if (!ids.length) break;
      const r = await prisma[model].deleteMany({
        where: { id: { in: ids.map((x) => x.id) } },
      });
      deleted += r.count || 0;
      if (ids.length < BATCH) break;
    }
  }

  await batchedDelete({ expiresAt: { lt: now } }, "userSession");
  await batchedDelete(
    { revokedAt: { lt: sessionRevokedCutoff } },
    "userSession"
  );
  await batchedDelete({ createdAt: { lt: sessionHardCutoff } }, "userSession");
  await batchedDelete({ createdAt: { lt: rtCutoff } }, "revokedRefreshToken");

  console.log("[cleanupSessions] deleted:", deleted);
  return { expired, revokedOld, tooOld, oldHashes, deleted, dryRun: false };
}

// runner
if (process.argv[1]?.endsWith("cleanupSessions.js")) {
  cleanupSessions().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
