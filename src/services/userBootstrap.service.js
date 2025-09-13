// Ensures all 1–1 child records exist for a user after OTP verification.
// Safe to call multiple times (idempotent).

import prisma from "../config/prisma.js";
import logUserAction from "../utils/logUserAction.js";

/**
 * Bootstrap user’s 1–1 tables after verification.
 * @param {import('express').Request} req
 * @param {Object} opts
 * @param {string} opts.userId - The verified user's ID
 * @param {string} [opts.loginId] - Optional Login table row id to link
 * @param {Object} [opts.defaults]
 * @param {Object} [opts.defaults.details] - e.g. { fullName, gender, profilePicture }
 * @param {Object} [opts.defaults.wallet] - e.g. { balance, currency }
 * @param {Object} [opts.defaults.documents] - e.g. { panNumber, panMasked }
 */
export async function bootstrapUserAfterVerification(
  req,
  { userId, loginId, defaults = {} }
) {
  return prisma.$transaction(async (tx) => {
    // 0) Verify user exists
    const user = await tx.user.findUnique({ where: { userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // 1) Link Login -> User (optional)
    // if (loginId) {
    //   await tx.login
    //     .update({
    //       where: { id: loginId },
    //       data: { userId },
    //     })
    //     .catch(() => {
    //       // If there is no login row or already linked, ignore quietly
    //     });
    // }

    // 2) Upsert/connect 1–1 tables
    await tx.user.update({
      where: { userId },
      data: {
        // UserDetails (1–1 via userId @unique)
        details: {
          connectOrCreate: {
            where: { userId }, // requires @@unique on UserDetails.userId
            create: { ...(defaults.details || {}) },
          },
        },

        // UserDocuments (1–1)
        documents: {
          connectOrCreate: {
            where: { userId }, // requires @@unique on UserDocuments.userId
            create: { ...(defaults.documents || {}) },
          },
        },

        // Wallet (1–1)
        wallet: {
          connectOrCreate: {
            where: { userId }, // requires @@unique on Wallet.userId
            create: {
              balance: 0, // adjust if you use Decimal type; number is fine for Prisma client
              //currency: "INR",
              ...(defaults.wallet || {}),
            },
          },
        },
        //Transaction (1–many) todo: handle separately
      },
    });

    // 3) Optional: mark basic flags
    await tx.user.update({
      where: { userId },
      data: {
        isActive: true,
        // kycStatus: user.kycStatus ?? "unverified", // uncomment if you track this here
      },
    });

    // 4) Activity log (best-effort)
    try {
      await logUserAction(
        req,
        "user_bootstrap",
        `Initialized child tables for user ${userId}`
      );
    } catch (_) {}

    return { ok: true };
  });
}
