// src/middlewares/limiters.js
import rateLimit from "express-rate-limit";

/**
 * OTP per-target key: stable per recipient (phone/email/target).
 * If your project used a similar helper before, this preserves behavior.
 */
export function otpTargetKey(req /*, res*/) {
  const b = req.body || {};
  const target =
    (typeof b.phoneNumber === "string" && b.phoneNumber.trim()) ||
    (typeof b.email === "string" && b.email.trim()) ||
    (typeof b.target === "string" && b.target.trim()) ||
    "";
  return target || "unknown";
}

/**
 * IPv6-safe key (prevents IPv6 users from bypassing IP limits).
 * Normalizes IPv6-mapped IPv4 (::ffff:127.0.0.1) and strips zone indexes.
 */
function ipv6SafeKey(req /*, res*/) {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  return ip.replace(/^::ffff:/, "").replace(/%.*$/, "");
}

/**
 * Wrapper adding:
 *  - Consistent JSON: { success:false, message }
 *  - Abuse logging on block
 *  - IPv6-safe keying by default
 *
 * NOTE: express-rate-limit v7: DO NOT use onLimitReached (removed).
 */
function withAbuseLogging(options = {}) {
  const messageText =
    typeof options.message === "string" ? options.message : "Too many requests";

  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipv6SafeKey,
    // Log when a request is BLOCKED (exceeded)
    handler: (req, res /*, next, opts*/) => {
      req.app
        ?.get?.("logger")
        ?.warn(
          { type: "RATE_LIMIT_BLOCK", ip: req.ip, path: req.originalUrl },
          "Rate limit block"
        );
      res.status(429).json({ success: false, message: messageText });
    },
    ...options,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * OTP limiters (same exported names/usage as before)
 * Mount BOTH per-target and per-IP for best protection:
 *   router.post("/send-otp", otpSendLimiter, otpSendIpLimiter, ...);
 *   router.post("/verify-otp", otpVerifyLimiter, otpVerifyIpLimiter, ...);
 * ──────────────────────────────────────────────────────────────────────────── */

export const otpSendLimiter = withAbuseLogging({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: otpTargetKey, // per-recipient throttling
  message: "Too many OTP requests, please try again later.",
});

export const otpSendIpLimiter = withAbuseLogging({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many OTP requests from this IP, please try again later.",
});

export const otpVerifyLimiter = withAbuseLogging({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: otpTargetKey, // per-recipient throttling
  message: "Too many OTP verifications, please try again later.",
});

export const otpVerifyIpLimiter = withAbuseLogging({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many OTP verifications from this IP, please try again later.",
});

/* ────────────────────────────────────────────────────────────────────────────
 * Session / refresh / management limiters (same exported names)
 * ──────────────────────────────────────────────────────────────────────────── */

export const refreshLimiter = withAbuseLogging({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "Too many refresh attempts, slow down.",
});

export const logoutLimiter = withAbuseLogging({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many logout attempts, please try again later.",
});

export const revokeLimiter = withAbuseLogging({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many revoke attempts, please try again later.",
});

export const sessionMgmtLimiter = withAbuseLogging({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many session requests, please slow down.",
});

/* ────────────────────────────────────────────────────────────────────────────
 * Global limiter (to satisfy existing imports)
 * - Safe default: generous limit; attach at app-level if needed.
 * - If you don’t need it anymore, remove the import from app.js instead.
 * ──────────────────────────────────────────────────────────────────────────── */
export const globalLimiter = withAbuseLogging({
  windowMs: 60 * 1000,
  max: 1000,
  message: "Too many requests, please try again later.",
});

// ratelimit for password updates
export const passwordUpdateLimiter = withAbuseLogging({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: "Too many password update attempts, please try again later.",
});

/* ────────────────────────────────────────────────────────────────────────────
 * Route mapping (for maintainers):
 *  - otpSendLimiter + otpSendIpLimiter        → POST /api/auth/send-otp
 *  - otpVerifyLimiter + otpVerifyIpLimiter    → POST /api/auth/verify-otp
 *  - refreshLimiter                           → POST /api/session/refresh
 *  - logoutLimiter                            → POST /api/session/logout
 *  - revokeLimiter                            → POST /api/session/revoke, /api/session/revoke-others
 *  - sessionMgmtLimiter                       → GET  /api/session
 * Notes:
 *  - JSON error shape is consistent: { success:false, message:"..." }.
 *  - Abuse events are logged via app logger (if available).
 *  - IPv6-safe key prevents IPv6 users from bypassing limits.
 * ──────────────────────────────────────────────────────────────────────────── */
