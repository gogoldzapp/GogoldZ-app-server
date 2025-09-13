// ESM middleware for Access JWT + DB session checks.

import prisma from "../config/prisma.js";
import { verifyAccessToken } from "../utils/tokens.js";

function getBearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
function send401(res, msg = "Unauthorized") {
  return res.status(401).json({ success: false, message: msg });
}
function send403(res, msg = "Forbidden") {
  return res.status(403).json({ success: false, message: msg });
}

async function validateAccess(req) {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error("Missing token"), { code: 401 });

  let claims;
  try {
    // expects: { sub, sid, sv, role, kyc, iat, exp }
    claims = verifyAccessToken(token);
  } catch {
    throw Object.assign(new Error("Invalid token"), { code: 401 });
  }

  const session = await prisma.userSession.findUnique({
    where: { id: claims.sid },
  });
  if (!session)
    throw Object.assign(new Error("Session not found"), { code: 401 });
  if (session.revokedAt)
    throw Object.assign(new Error("Session revoked"), { code: 401 });
  if (session.expiresAt && session.expiresAt < new Date())
    throw Object.assign(new Error("Session expired"), { code: 401 });
  if (session.sessionVersion !== claims.sv)
    throw Object.assign(new Error("Session updated—please refresh"), {
      code: 401,
    });

  req.user = {
    id: claims.sub,
    userId: claims.sub,
    role: claims.role || "user",
    kyc: claims.kyc || "NONE",
    sessionId: claims.sid,
    tokenClaims: claims,
  };
  return { claims, session };
}

export async function requireAuth(req, res, next) {
  try {
    await validateAccess(req);
    return next();
  } catch (e) {
    return res
      .status(e.code || 401)
      .json({ success: false, message: e.message || "Unauthorized" });
  }
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return send401(res);
    const role = String(req.user.role || "").toLowerCase();
    const ok = allowed.map((r) => String(r).toLowerCase()).includes(role);
    if (!ok) return send403(res, "Insufficient role");
    next();
  };
}

export async function softAuth(req, res, next) {
  const tok = getBearer(req);
  if (!tok) {
    req.user = null;
    return next();
  }
  try {
    await validateAccess(req);
  } catch {
    req.user = null;
  }
  return next();
}
