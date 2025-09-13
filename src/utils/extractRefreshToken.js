// src/utils/extractRefreshToken.js
import security from "../config/security.js";

export default function extractRefreshToken(req) {
  const fromCookie = req.cookies?.refreshToken;
  const fromHeader = req.headers["x-refresh-token"];
  const fromBody = req.body?.refreshToken;

  if (fromCookie) return { token: fromCookie, source: "cookie" };
  if (fromHeader) return { token: fromHeader, source: "header" };

  if (
    security.allowBodyRefreshToken &&
    typeof fromBody === "string" &&
    fromBody.length >= 40
  ) {
    return { token: fromBody, source: "body" };
  }

  if (!security.allowBodyRefreshToken && fromBody) {
    req.logger.warn(
      "Refresh token supplied in body but allowBodyRefreshToken=false"
    );
    return null;
  }

  return null;
}
// This function extracts the refresh token from the request object.
