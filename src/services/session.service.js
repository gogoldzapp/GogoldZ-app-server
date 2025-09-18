// src/services/session.service.js
import { randomBytes } from "crypto";
import { hash as bHash, compare as bCompare } from "bcryptjs";
import prisma from "../config/prisma.js";
import { signAccessToken } from "../utils/tokens.js";

const REFRESH_TOKEN_TTL_DAYS = parseInt(
  process.env.REFRESH_TOKEN_TTL_DAYS || "30",
  10
);
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "refresh_token";
const REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || "/session";
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "csrf_token";

function addDays(date, d) {
  const dt = new Date(date);
  dt.setDate(dt.getDate() + d);
  return dt;
}

/** Create session & tokens for a user (JWT sub must be business userId) */
export async function createSessionAndTokens({
  user,
  userAgent,
  ip,
  deviceName,
  platform,
}) {
  const rawRt = randomBytes(32).toString("base64url");
  const rtHash = await bHash(rawRt, 10);
  const expires = addDays(new Date(), REFRESH_TOKEN_TTL_DAYS);

  const session = await prisma.userSession.create({
    data: {
      userId: user.userId || user.id, // prefer business userId
      refreshTokenHash: rtHash,
      device: deviceName || null,
      platform: platform || null,
      ip: ip || null,
      sessionVersion: 1,
      expiresAt: expires,
    },
  });

  const accessToken = signAccessToken({
    sub: session.userId,
    sid: session.id,
    sv: session.sessionVersion,
    role: user.role || "user",
    kyc: user.kycStatus || (user.isVerified ? "VERIFIED" : "NONE"),
  });

  return { session, accessToken, refreshToken: rawRt };
}

/** Rotate refresh token; reuse-detection handled separately */
export async function issueRefreshRotation({ rawRefreshToken }) {
  // Find matching active session (bounded scan)
  const candidates = await prisma.userSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let session = null;
  for (const s of candidates) {
    if (
      s.refreshTokenHash &&
      (await bCompare(rawRefreshToken, s.refreshTokenHash))
    ) {
      session = s;
      break;
    }
  }
  if (!session)
    throw Object.assign(new Error("Invalid refresh token"), { status: 401 });

  // Rotate
  const oldHash = session.refreshTokenHash;
  const newRaw = randomBytes(32).toString("base64url");
  const newHash = await bHash(newRaw, 10);

  const updated = await prisma.userSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: newHash,
      expiresAt: addDays(new Date(), REFRESH_TOKEN_TTL_DAYS),
    },
  });

  // Log the old hash for reuse detection
  await prisma.revokedRefreshToken.create({
    data: { sessionId: session.id, tokenHash: oldHash },
  });

  // Re-sign access token (optionally fetch user for role/kyc)
  const accessToken = signAccessToken({
    sub: updated.userId,
    sid: updated.id,
    sv: updated.sessionVersion,
    role: "user",
    kyc: "NONE",
  });

  return { accessToken, refreshToken: newRaw, session: updated };
}

/** If presented token matches any revoked hash -> revoke the linked session */
export async function reuseDetectionAndRevoke(rawRefreshToken) {
  const revoked = await prisma.revokedRefreshToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  for (const r of revoked) {
    if (await bCompare(rawRefreshToken, r.tokenHash)) {
      const updated = await prisma.userSession.update({
        where: { id: r.sessionId },
        data: {
          revokedAt: new Date(),
          refreshTokenHash: null,
          sessionVersion: { increment: 1 },
        },
        select: { id: true, userId: true },
      });
      return updated;
    }
  }
  return null;
}

/** Revoke by raw refresh token (helper for logout flows) */
export async function revokeByRefreshToken(rawRefreshToken) {
  const active = await prisma.userSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  for (const s of active) {
    if (
      s.refreshTokenHash &&
      (await bCompare(rawRefreshToken, s.refreshTokenHash))
    ) {
      const updated = await prisma.userSession.update({
        where: { id: s.id },
        data: {
          revokedAt: new Date(),
          refreshTokenHash: null,
          sessionVersion: { increment: 1 },
        },
        select: { id: true, userId: true },
      });
      return updated;
    }
  }
  return null;
}

export async function revokeSessionById(userId, sessionId) {
  //Enforce ownership in the where clause
  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, userId: true },
  });
  if (!session || session.userId !== userId) return false;
  await prisma.userSession.update({
    where: { id: sessionId },
    data: {
      revokedAt: new Date(),
      refreshTokenHash: null,
      sessionVersion: { increment: 1 },
    },
  });
  return true;
}

export async function revokeAllSessions(userId, keepCurrentSessionId = null) {
  await prisma.userSession.updateMany({
    where: {
      userId,
      id: keepCurrentSessionId ? { not: keepCurrentSessionId } : undefined,
    },
    data: {
      revokedAt: new Date(),
      refreshTokenHash: null,
      sessionVersion: { increment: 1 },
    },
  });
}

export async function listUserSessions(
  userId,
  { includeRevoked = false } = {}
) {
  return prisma.userSession.findMany({
    where: { userId, ...(includeRevoked ? {} : { revokedAt: null }) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      sessionVersion: true,
      device: true,
      platform: true,
      ip: true,
    },
  });
}

/** Cookies + CSRF (double-submit for cookie flows) */
export function setRefreshCookie(res, rawRefreshToken) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(REFRESH_COOKIE_NAME, rawRefreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
  // CSRF token cookie for web
  const csrf = randomBytes(24).toString("base64url");
  res.cookie(CSRF_COOKIE_NAME, csrf, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return csrf;
}

export function readRefreshFromReq(req) {
  const header = req.headers["x-refresh-token"];
  if (header) return { token: String(header), from: "header" };
  const cookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (cookie) return { token: String(cookie), from: "cookie" };
  const body = req.body?.refreshToken;
  if (body) return { token: String(body), from: "body" };
  return { token: null, from: null };
}

export function requireCsrfIfCookie(req) {
  const provided = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];
  const cookie = req.cookies?.[CSRF_COOKIE_NAME];
  if (!cookie)
    return { ok: false, status: 401, message: "Missing CSRF cookie" };
  if (!provided)
    return { ok: false, status: 401, message: "Missing x-csrf-token header" };
  if (String(provided) !== String(cookie))
    return { ok: false, status: 401, message: "CSRF token mismatch" };
  return { ok: true };
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: false, // CSRF cookie is readable by JS
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

