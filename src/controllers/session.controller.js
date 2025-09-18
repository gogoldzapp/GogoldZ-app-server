import {
  readRefreshFromReq,
  requireCsrfIfCookie,
  reuseDetectionAndRevoke,
  issueRefreshRotation,
  revokeByRefreshToken,
  listUserSessions,
  revokeSessionById,
  revokeAllSessions,
  setRefreshCookie,
  clearRefreshCookie,
} from "../services/session.service.js";
import logUserAction from "../utils/logUserAction.js";
import { ok, unauthorized, bad } from "../utils/responder.js";

/**
 * Refresh user session tokens.
 *
 * @param {*} req
 * @param {*} res
 * @returns
 */
export async function refresh(req, res) {
  try {
    await logUserAction(req, "refresh_attempt", "User attempted token refresh");

    // 1. Extract token + flow type
    const { token: rawRefreshToken, from } = readRefreshFromReq(req);
    if (!rawRefreshToken) {
      await logUserAction(req, "refresh_failed", "Missing refresh token");
      return unauthorized(res, "Missing refresh token");
    }

    // 2. CSRF only for cookie flow
    if (from === "cookie") {
      const csrf = requireCsrfIfCookie(req);
      if (!csrf.ok) {
        await logUserAction(req, "refresh_failed", csrf.message);
        return res
          .status(csrf.status)
          .json({ success: false, message: csrf.message });
      }
    }

    // 3. Reuse detection
    const reusedSession = await reuseDetectionAndRevoke(rawRefreshToken);
    if (reusedSession) {
      req.user = req.user || {};
      req.user.userId = req.user.userId || reusedSession.userId;

      await logUserAction(req, "refresh_failed", "token_reuse_detected", {
        sessionId: reusedSession.id,
      });
      return unauthorized(
        res,
        "Suspicious activity detected. Sessions revoked. Please log in again."
      );
    }

    // 4. Rotate
    const { accessToken, refreshToken, session } = await issueRefreshRotation({
      rawRefreshToken,
    });

    req.user = req.user || {};
    req.user.userId = req.user.userId || session.userId;

    // 5. Deliver
    if (from === "cookie") {
      setRefreshCookie(res, refreshToken);
      await logUserAction(req, "refresh_success", "Rotated refresh cookie", {
        sessionId: session.id,
        flow: from,
      });
      return ok(res, "Token refreshed", { accessToken });
    }

    await logUserAction(
      req,
      "refresh_success",
      "Rotated refresh token (header/body)",
      { sessionId: session.id, flow: from }
    );
    return ok(res, "Token refreshed", { accessToken, refreshToken });
  } catch (error) {
    await logUserAction(req, "refresh_failed", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Logout user and invalidate session tokens.
 *
 * @param {*} req
 * @param {*} res
 * @returns
 */
export async function logout(req, res) {
  try {
    await logUserAction(req, "logout_attempt", "User attempted logout");

    const { token: rawRefreshToken } = readRefreshFromReq(req);
    let revokedSession = null;
    if (rawRefreshToken) {
      revokedSession = await revokeByRefreshToken(rawRefreshToken);
      if (revokedSession) {
        req.user = req.user || {};
        req.user.userId = req.user.userId || revokedSession.userId;
      }
    }

    clearRefreshCookie(res); // <<-- use the service helper

    await logUserAction(req, "logout", "User logged out", {
      revokedSessionId: revokedSession ? revokedSession.id : null,
    });
    return ok(res, "Logged out");
  } catch (error) {
    await logUserAction(req, "logout_failed", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get user sessions.
 *
 * @param {*} req
 * @param {*} res
 * @returns
 */
export async function getSessions(req, res) {
  try {
    const sessions = await listUserSessions(req.user.userId);
    return ok(res, "Active sessions", sessions);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Revoke a user session.
 * @param {*} req
 * @param {*} res
 * @returns
 */
export async function revokeSession(req, res) {
  try {
    const { sessionId } = req.body || {};
    await logUserAction(req, "revoke_session_attempt", "Attempting to revoke session", {
      sessionId,
    });

    const success = await revokeSessionById(req.user.userId, sessionId);
    if (!success) {
      await logUserAction(req, "revoke_session_denied", "Session revoke denied", {
        sessionId,
      });
      return bad(res, "Not found or forbidden", 404);
    }

    await logUserAction(req, "revoke_session_success", "Session revoked", {
      sessionId,
    });
    return ok(res, "Session revoked");
  } catch (error) {
    await logUserAction(req, "revoke_session_failed", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Revoke all user sessions except the current one.
 * @param {*} req
 * @param {*} res
 * @returns
 */
export async function revokeOthers(req, res) {
  try {
    const { keepSessionId } = req.body || {};
    await logUserAction(req, "revoke_others_attempt", "Attempting to revoke other sessions", {
      keepSessionId: keepSessionId || null,
    });

    await revokeAllSessions(req.user.userId, keepSessionId || null);

    await logUserAction(req, "revoke_others_success", "Other sessions revoked", {
      keepSessionId: keepSessionId || null,
    });
    return ok(res, "Other sessions revoked");
  } catch (error) {
    await logUserAction(req, "revoke_others_failed", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}
