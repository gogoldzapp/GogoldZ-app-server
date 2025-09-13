import {
  issueRefreshRotation,
  revokeByRefreshToken,
  listUserSessions,
  revokeSessionById,
  revokeAllSessions,
} from "../services/session.service.js";
import logActivity from "../utils/logActivity.js";
import extractRefreshToken from "../utils/extractRefreshToken.js";
import { ok, unauthorized, notFound, bad } from "../utils/responder.js";

export async function refresh(req, res) {
  try {
    const rt = extractRefreshToken(req);
    if (!rt) return unauthorized(res, "Missing refresh token");

    const result = await issueRefreshRotation(rt, req);
    if (!result.ok) {
      const msg =
        result.reason === "token_reuse_detected"
          ? "Suspicious activity detected. Sessions revoked. Please log in again."
          : "Invalid or expired refresh token";
      return unauthorized(res, msg);
    }

    // For web: set new refresh cookie (httpOnly). For mobile: send JSON.
    // res.cookie("refreshToken", result.refreshToken, { httpOnly: true, sameSite: "strict", secure: true, maxAge: 30*24*60*60*1000 });

    return ok(res, "Token refreshed", {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      session: result.session, // metadata back
    });
  } catch (error) {
    console.error("Error in refresh:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function logout(req, res) {
  try {
    const rt = extractRefreshToken(req);
    if (!rt) return ok(res, "No active session"); // idempotent but explicit
    await revokeByRefreshToken(rt);
    if (req.user?.userId)
      await logActivity(req.user.userId, "logout", "User logged out");
    return ok(res, "Logged out");
  } catch (error) {
    console.error("Error in logout:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function getSessions(req, res) {
  try {
    const sessions = await listUserSessions(req.user.userId);
    return ok(res, "Active sessions", sessions);
  } catch (error) {
    console.error("Error in getSessions:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function revokeSession(req, res) {
  try {
    const ok = await revokeSessionById(req.user.userId, req.params.id);
    if (!ok) return bad(res, "Not found or forbidden", 404);
    await logActivity(
      req.user.userId,
      "session_revoked",
      `Revoked session ${req.params.id}`
    );
    return ok(res, "Session revoked");
  } catch (error) {
    console.error("Error in revokeSession:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function revokeOthers(req, res) {
  try {
    const rt = extractRefreshToken(req);
    if (!rt) return bad(res, "Missing refresh token");
    await revokeAllSessions(req.user.userId, rt);
    await logActivity(
      req.user.userId,
      "sessions_revoked_others",
      "Revoked other sessions"
    );
    return ok(res, "Other sessions revoked");
  } catch (error) {
    console.error("Error in revokeOthers:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
