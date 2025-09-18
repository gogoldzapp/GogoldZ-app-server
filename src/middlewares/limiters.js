import rateLimit from "express-rate-limit";

/**
 * IMPORTANT: make sure your app is behind a proxy sets `trust proxy`
 * in src/server.js or wherever you create the Express app:
 *   app.set('trust proxy', true)
 * so req.ip uses X-Forwarded-For correctly (Heroku/Render/Nginx/etc.)
 */
/**IPv6-safe key generator( uses the library helper when available ) */
const ipv6SafeKey = (req) => {
  return req.ip || "unknown"; // fallback if lib fn missing
};

/**Factory for making consistent limiters */

export function makeLimiter({
  windowMs,
  limit,
  message = "Too many requests, slow down",
}) {
  return rateLimit({
    windowMs,
    max: limit,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    keyGenerator: ipv6SafeKey,
    validate: true,
  });
}

/* --------- Shared limiters you can reuse across routes --------- */

// Global API limiter (e.g., 100 req/15m per IP)
export const globalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 100,
});

// === OTP limits (memory-only) ===
const OTP_WINDOW_MS = parseInt(process.env.OTP_WINDOW_MS || "600000", 10); // 10 min
const OTP_MAX_PER_TARGET = parseInt(process.env.OTP_MAX_PER_TARGET || "5", 10); // per phone/email
const OTP_MAX_PER_IP = parseInt(process.env.OTP_MAX_PER_IP || "25", 10); // per IP

// Build stable key per recipient: "<CHANNEL>:<TARGET>"
function otpTargetKey(req) {
  const b = req.body || {};
  const ch = String(
    b.channel || (b.phoneNumber ? "PHONE" : b.email ? "EMAIL" : "")
  ).toUpperCase();
  const tgt = b.target || b.phoneNumber || b.email || "";
  return ch && tgt ? `${ch}:${tgt}` : `UNK:${req.ip}`; // fallback if body missing
}

const otpPerTargetLimiter = rateLimit({
  windowMs: OTP_WINDOW_MS,
  max: OTP_MAX_PER_TARGET,
  keyGenerator: otpTargetKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP attempts for this recipient",
  },
});

const otpPerIpLimiter = rateLimit({
  windowMs: OTP_WINDOW_MS,
  max: OTP_MAX_PER_IP,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP requests from this IP" },
});

// Export combos so both limits apply
export const otpSendLimiter = [otpPerIpLimiter, otpPerTargetLimiter];
export const otpVerifyLimiter = [otpPerIpLimiter, otpPerTargetLimiter];

export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30, // 30 refreshes/5min per IP
  standardHeaders: true,
  legacyHeaders: false,
});

export const sessionMgmtLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60, // revoke/list/etc
  standardHeaders: true,
  legacyHeaders: false,
});

export const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // logout
  standardHeaders: true,
  legacyHeaders: false,
});

export const revokeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // revoke session
  standardHeaders: true,
  legacyHeaders: false,
});

//Mount on routes: /session/refresh, /session/logout, /session/sessions*.
