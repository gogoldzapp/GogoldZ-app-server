// src/app.js
import "express-async-errors";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import xss from "xss-clean";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import transactionRoutes from "./routes/transaction.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import sessionRoutes from "./routes/session.routes.js";

import errorHandler from "./middlewares/errorHandler.js";
import {
  setCsrfCookie,
  requireCsrf,
  _debugShowCsrf,
} from "./middlewares/csrf.js";

import metrics from "./config/metrics.js"; // keeping your existing metrics handler
import config from "./config/index.js";
import validateConfig from "./config/validateConfig.js";
import { requireAuth, requireRole } from "./auth/requireAuth.js";
import { httpLogger, ILogger } from "./logger.js";

import { pingDb } from "./db/prisma.js";
import { pingSupabase } from "./supabase.js";

import { metricsRouter } from "./routes/metrics.route.js";
import { globalLimiter } from "./middlewares/limiters.js";

validateConfig();

const app = express();
app.set("trust proxy", 1);

app.use(globalLimiter); // Apply global rate limiter to all requests

/* ------------------------ Security headers (Helmet) ----------------------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "script-src": ["'self'"], // avoid 'unsafe-inline'
        "connect-src": ["'self'", "https://api.gogoldz.com"],
      },
    }, // API-only; enable + tune if serving HTML
    hidePoweredBy: true,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: config.isProd
      ? { maxAge: 15552000, includeSubDomains: true, preload: true }
      : false,
  })
);

/* ------------------------------ HTTP logger ------------------------------ */
app.use(httpLogger);
app.set("logger", httpLogger.logger);

/* ------------------------------ Body parsers ----------------------------- */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* -------------------------------- Cookies -------------------------------- */
app.use(cookieParser(config.cookie.secret));

/* --------------------------------- CORS ---------------------------------- */
/**
 * Single, consolidated CORS: allowlist from config.cors.allowlist,
 * credentials enabled for cookie-based auth, and CSRF header allowed.
 */
const allowlist = new Set(config.cors.allowlist || []);
app.use(
  cors({
    origin(origin, cb) {
      // Allow tools like Postman/cURL (no Origin header)
      if (!origin) return cb(null, true);
      return cb(null, allowlist.has(origin));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
   allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-XSRF-Token", "CSRF-Token"],
    exposedHeaders: [],
  })
);
app.options("*", cors());

/* ------------------------------ Rate limiting ---------------------------- */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* ---------------------------- XSS basic harden --------------------------- */
app.use(xss());

/* --------------------------- Health / readiness -------------------------- */
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readiness", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const [dbOk, supaOk] = await Promise.all([pingDb(), pingSupabase()]);
  const ok = dbOk && supaOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ready" : "degraded",
    checks: { db: dbOk, supabase: supaOk },
  });
});

/* ------------------------------- CSRF setup ------------------------------ */
/**
 * Double-submit cookie strategy:
 * - setCsrfCookie issues a readable token cookie
 * - requireCsrf enforces header↔cookie match on state-changing routes
 */
app.use(setCsrfCookie);
app.get("/_csrf-debug", _debugShowCsrf); // TEMP: remove after debugging
app.use(requireCsrf);

/* ------------------------------ Demo endpoints --------------------------- */
// 🔐 Current user (requires auth)
app.get("/api/me", requireAuth, async (req, res) => {
  const { user } = req; // local user row (prisma)
  const { user: authUser } = req.auth; // Supabase auth user
  res.json({
    localUser: {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      authUserId: user.authUserId,
    },
    auth: {
      id: authUser.id,
      email: authUser.email,
      phone: authUser.phone,
    },
  });
});

// 🔐 Admin-only example
app.get("/api/admin/ping", requireAuth, requireRole, (_req, res) => {
  res.json({ ok: true, role: "admin" });
});

/* --------------------------------- Routes -------------------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
// Wallet/Transaction routes will be finalized later; leaving mounts in place
app.use("/api/transaction", transactionRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/session", sessionRoutes);

/* -------------------------------- Metrics -------------------------------- */
app.use("/api/metrics", metricsRouter);
// Direct /metrics endpoint with key auth (for non-/api path)
app.use("/metrics", (req, res, next) => {
  if (req.get("x-metrics-key") !== config.metrics.key) {
    return res.sendStatus(403);
  }
  return metrics.metricsHandler(req, res, next);
});

/* ------------------------------ Root & errors ---------------------------- */
app.get("/", (_req, res) => res.send("🌟 GoGoldZ App API is live"));

// Central error handler (your existing)
app.use(errorHandler);

// Last-resort error fence with logging
app.use((err, req, res, _next) => {
  ILogger.error({ err, path: req.path }, "Unhandled error");
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export default app;
