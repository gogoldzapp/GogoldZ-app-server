import crypto from "crypto";
import config from "../config/index.js";

const CANON_COOKIE = "csrfToken"; // canonical name we will issue
const COOKIE_CANDIDATES = ["csrfToken", "csrf_token"]; // accept either from client
const HEADER_CANDIDATES = ["x-csrf-token", "x-xsrf-token", "csrf-token"]; // lowercase!

function readHeader(req) {
  // Express lowercases header names; req.get() is case-insensitive
  for (const h of HEADER_CANDIDATES) {
    const v = req.get(h);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function readCookie(req) {
  const jar = req.cookies || {};
  for (const name of COOKIE_CANDIDATES) {
    const v = jar[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Always issue a readable CSRF cookie (canonical name) */
export function setCsrfCookie(req, res, next) {
  const existing = readCookie(req);
  if (!existing) {
    const token = crypto.randomBytes(32).toString("base64url");
    res.cookie(CANON_COOKIE, token, {
      httpOnly: false,
      secure: config.isProd,
      sameSite: "lax", // if you do cross-site XHR in browsers, use {sameSite:"none", secure:true}
      path: "/",
      maxAge: 12 * 60 * 60 * 1000,
    });
  }
  // Clean up legacy/mismatched cookie name if present
  if (req.cookies?.csrf_token) {
    res.clearCookie("csrf_token", { path: "/" });
  }
  next();
}

/** Enforce double-submit for state-changing requests */
export function requireCsrf(req, res, next) {
  const m = req.method.toUpperCase();
  const needs = m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
  if (!needs) return next();

  // Require CSRF only when a CSRF cookie is actually present (i.e., cookie-based contexts)
  const cookie = readCookie(req);
  if (!cookie) return next(); // stateless clients (no cookies) skip CSRF

  const header = readHeader(req);
  try {
    req.app?.get("logger")?.warn?.(
      {
        type: "CSRF_FAILED",
        ip: req.ip,
        ua: req.get("user-agent"),
        path: req.path,
        method: req.method,
        headerPresent: !!header,
        cookiePresent: !!cookie,
      },
      "CSRF validation failed"
    );
  } catch (err) {
    // Optional: handle/log error if needed
    console.error("Error logging CSRF failure:", err);
  }
  if (!header || header !== cookie) {
    return res
      .status(403)
      .json({
        success: false,
        message: "CSRF validation failed",
        code: "CSRF_MISMATCH",
      });
  }
  next();
}

/** TEMP: Debug endpoint */
export function _debugShowCsrf(req, res) {
  res.json({
    method: req.method,
    hasAnyCookie: !!req.headers.cookie,
    cookie: readCookie(req),
    header: readHeader(req),
    ok: !!readCookie(req) && readHeader(req) === readCookie(req),
  });
}
