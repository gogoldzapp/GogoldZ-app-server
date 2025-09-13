import { Router } from "express";
import Joi from "joi";
import bcrypt from "bcryptjs";

import config from "../config/index.js";
import { prisma } from "../db/prisma.js";

import { refreshLimiter } from "../middlewares/limiters.js";
import { requireCsrf } from "../middlewares/csrf.js";
import { enforceSessionPolicies } from "../middlewares/sessionGuards.js";
import validate from "../middlewares/validate.js"; // tiny wrapper that runs Joi (see below alt)

import {
  verifyRefreshToken, // (refreshJWT) -> payload { sub: userId, sid: sessionId, ... }
  issueRotatedTokens, // (user) -> { accessToken, refreshToken, refreshHash }
  setRefreshCookie, // (res, refreshToken)
  clearRefreshCookie, // (res)
} from "../utils/tokens.js";

import logUserAction from "../utils/logUserAction.js";

// If your tokens util doesn't export clearRefreshCookie, this local fallback is used.
function clearRefreshCookieFallback(res) {
  res.clearCookie("rt", {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/session",
  });
}
const doClearRefreshCookie = (res) =>
  typeof clearRefreshCookie === "function"
    ? clearRefreshCookie(res)
    : clearRefreshCookieFallback(res);

const router = Router();

/* -------------------------------------------------------------------------- */
/*                              Helper middleware                              */
/* -------------------------------------------------------------------------- */
/**
 * Parse & verify the refresh token (cookie or header) and attach:
 *   req.user  = prisma user
 *   req.auth  = { userId, sessionId, refreshToken }
 */
async function requireRefreshAuth(req, res, next) {
  try {
    const rt =
      req.cookies?.rt || // cookie name 'rt' (change if your project uses a different name)
      req.get("x-refresh-token"); // only for native/mobile — avoid on web

    if (!rt)
      return res
        .status(401)
        .json({ success: false, message: "Missing refresh token" });

    const payload = await verifyRefreshToken(rt); // throws on invalid/expired
    const userId = payload.sub;
    const sessionId = payload.sid;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "User not found" });

    req.user = user;
    req.auth = { userId, sessionId, refreshToken: rt };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired refresh token" });
  }
}

/**
 * Middleware : Detect refresh token reuse and revoke session if detected.
 */
async function detectAndRevokeOnReuse(req, res, next) {
  const s = req._sessionRecord; // set by enforceSessionPolicies
  const presentedToken = req.auth?.refreshToken;
  if (!s && !!presentedToken) return next(); // no session found, but no token presented? skip

  //Compare hash of presented token to stored hash
  const isTokenValid = await bcrypt.compare(presentedToken, s.refreshTokenHash);

  if (!isTokenValid) {
    // Token reuse detected: revoke session immediately.
    await prisma.userSession.update({
      where: { id: s.id },
      data: { revokedAt: new Date(), revokeReason: "token_reuse" },
    });
    await logUserAction({
      userId: req.user.id,
      action: "SESSION_REVOKE_ON_REUSE",
      ip: req.ip,
      meta: { sessionId: s.id },
    });
    return res
      .status(401)
      .json({ success: false, message: "Token reuse detected" });
  }

  next();
}

/* -------------------------------------------------------------------------- */
/*                                   Schemas                                   */
/* -------------------------------------------------------------------------- */
const revokeSchema = Joi.object({
  body: Joi.object({
    sessionId: Joi.string().uuid().required(),
  }),
});

const revokeOthersSchema = Joi.object({
  body: Joi.object({
    keepSessionId: Joi.string().uuid().required(), // the current/allowed session
  }),
});

/* -------------------------------------------------------------------------- */
/*                                  Endpoints                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /session/refresh
 * - CSRF-protected, rate-limited
 * - Validates session status via enforceSessionPolicies (idle/absolute/ua binding)
 * - Rotates refresh token (fixation defense), updates session timers
 * - Returns new access token + sets new refresh cookie
 */
router.post(
  "/refresh",
  refreshLimiter,
  requireCsrf,
  requireRefreshAuth,
  enforceSessionPolicies,
  detectAndRevokeOnReuse,
  async (req, res) => {
    const s = req._sessionRecord; // set by enforceSessionPolicies
    const now = new Date();

    // Rotate token pair
    const { accessToken, refreshToken, refreshHash } = await issueRotatedTokens(
      req.user
    );

    await prisma.userSession.update({
      where: { id: s.id },
      data: {
        refreshTokenHash: refreshHash,
        lastUsedAt: now,
        idleExpiresAt: new Date(now.getTime() + 30 * 60 * 1000), // 30m idle
        absoluteExpiresAt:
          s.absoluteExpiresAt ??
          new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30d absolute
        ip: req.ip ?? s.ip,
      },
    });

    setRefreshCookie(res, refreshToken); // httpOnly, secure(prod), sameSite:lax, path:'/session'
    await logUserAction({
      userId: req.user.id,
      action: "SESSION_REFRESH",
      ip: req.ip,
      meta: { sessionId: s.id },
    });

    return res.json({ success: true, accessToken });
  }
);

/**
 * POST /session/logout
 * - CSRF-protected; revokes the current refresh session using the refresh cookie
 * - Clears the refresh cookie
 */
router.post("/logout", requireCsrf, requireRefreshAuth, async (req, res) => {
  const { sessionId } = req.auth || {};
  if (sessionId) {
    await prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "logout" },
    });
    await logUserAction({
      userId: req.user.id,
      action: "SESSION_LOGOUT",
      ip: req.ip,
      meta: { sessionId },
    });
  }
  doClearRefreshCookie(res);
  return res.json({ success: true });
});

/**
 * GET /session
 * - Lists active (non-revoked, non-expired) sessions for the current user
 * - Requires a valid **access** token (not refresh)
 */
router.get("/", async (req, res) => {
  // If your project has a standard requireAuth (access JWT), use it:
  // router.get("/", requireAuth, async (req, res) => { ... })
  // For convenience here we detect user by optional access auth you might already attach:
  const userId = req.user?.id || req.auth?.userId;
  if (!userId)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const now = new Date();
  const sessions = await prisma.userSession.findMany({
    where: {
      userId,
      revokedAt: null,
      OR: [{ absoluteExpiresAt: null }, { absoluteExpiresAt: { gt: now } }],
    },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      idleExpiresAt: true,
      absoluteExpiresAt: true,
      ip: true,
      uaFingerprint: true,
    },
  });

  return res.json({ success: true, sessions });
});

/**
 * POST /session/revoke
 * - CSRF-protected; revoke a specific session by id (must belong to current user)
 * - Requires **access** token auth
 */
router.post(
  "/revoke",
  requireCsrf,
  validate(revokeSchema),
  async (req, res) => {
    const userId = req.user?.id || req.auth?.userId;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { sessionId } = req.body;

    const s = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!s || s.userId !== userId) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    if (!s.revokedAt) {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokeReason: "manual-revoke" },
      });
      await logUserAction({
        userId,
        action: "SESSION_REVOKE",
        ip: req.ip,
        meta: { sessionId },
      });
    }

    return res.json({ success: true });
  }
);

/**
 * POST /session/revoke-others
 * - CSRF-protected; revoke all sessions except the provided one
 * - Requires **access** token auth
 */
router.post(
  "/revoke-others",
  requireCsrf,
  validate(revokeOthersSchema),
  async (req, res) => {
    const userId = req.user?.id || req.auth?.userId;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { keepSessionId } = req.body;

    await prisma.userSession.updateMany({
      where: { userId, id: { not: keepSessionId }, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "revoke-others" },
    });

    await logUserAction({
      userId,
      action: "SESSION_REVOKE_OTHERS",
      ip: req.ip,
      meta: { keepSessionId },
    });

    return res.json({ success: true });
  }
);

export default router;
