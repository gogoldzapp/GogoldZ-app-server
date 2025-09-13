// src/utils/tokens.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import config from "../config/index.js";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "change_me";
const ACCESS_TOKEN_TTL = parseInt(process.env.ACCESS_TOKEN_TTL || "900", 10); // 15m
const REFRESH_TOKEN_TTL = parseInt(
  process.env.REFRESH_TOKEN_TTL || `${30 * 24 * 60 * 60}`,
  10
); // 30d
const JWT_ISSUER = process.env.JWT_ISSUER || "gogoldz";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "gogoldz.app";

/* --------------------------- Access token helpers -------------------------- */

export function signAccessToken(payload, opts = {}) {
  const ttl = opts.ttlSec || ACCESS_TOKEN_TTL;
  return jwt.sign(
    { ...payload, jti: randomUUID(), iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: ttl,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/* --------------------------- Refresh token helpers ------------------------- */

/**
 * Sign a refresh token with user + session info.
 * payload: { sub: userId, sid: sessionId }
 */
export function signRefreshToken(payload, opts = {}) {
  const ttl = opts.ttlSec || REFRESH_TOKEN_TTL;
  return jwt.sign({ ...payload }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: ttl,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/**
 * Issues a rotated token pair and returns accessToken, refreshToken, and a bcrypt hash
 * for storing the refresh token server-side.
 */
export async function issueRotatedTokens(user) {
  const sessionId = user.sessionId || user.userId; // adjust depending on schema
  const accessToken = signAccessToken({
    sub: user.userId,
    sid: sessionId,
    role: user.role || "user",
    kyc: user.kyc || "NONE",
    sv: user.sessionVersion || 1,
  });

  const refreshToken = signRefreshToken({ sub: user.userId, sid: sessionId });
  const refreshHash = await bcrypt.hash(refreshToken, 12);

  return { accessToken, refreshToken, refreshHash };
}

/* ---------------------------- Cookie helpers ------------------------------- */

export function setRefreshCookie(res, refreshToken) {
  res.cookie("rt", refreshToken, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/session",
    maxAge: REFRESH_TOKEN_TTL * 1000,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie("rt", {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/session",
  });
}
