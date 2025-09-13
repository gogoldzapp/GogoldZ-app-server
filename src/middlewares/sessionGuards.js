/**
 * Goals: prevent session fixation, honor idle + absolute timeouts,
 * bind sessions to UA/IP to reduce token theft risk.
 */
import { UAParser } from "ua-parser-js";
import { prisma } from "../db/prisma.js";

export async function enforceSessionPolicies(req, res, next) {
  const refreshId = req.auth?.refreshId; //put this into JWT when issuing
  if (!refreshId) return next(); //no session to enforce
  const session = await prisma.session.findUnique({
    where: { id: refreshId },
  });
  if (!session || session.revokedAt) {
    return res.status(401).json({ message: "Session not found or revoked" });
  }
  const now = new Date();
  if (session.absoluteExpiryAt && now > session.absoluteExpiryAt.getTime()) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: "absolute timeout" },
    });
    return res
      .status(401)
      .json({ message: "Session expired (absolute timeout)" });
  }
  if (session.idleExpiryAt && now > session.idleExpiryAt.getTime()) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: "idle timeout" },
    });
    return res.status(401).json({ message: "Session expired (idle timeout)" });
  }

  //User-Agent/IP binding (soft)
  const ua = UAParser(req.headers["user-agent"] || "");
  const fp = `${ua.browser.name || "?"}|${ua.os.name || "?"}|${req.ip || "?"}`;
  if (session.fingerprint && session.fingerprint !== fp) {
    //either block or mark a suspicious; here we block
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: "fingerprint mismatch" },
    });
    return res
      .status(401)
      .json({ message: "Session invalid (fingerprint mismatch)" });
  }
  if (session.ip && req.ip && session.ip !== req.ip) {
    // Optional strict IP binding—consider same /24 only if mobile users
    // For now, just mark suspicious in activity log
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: "IP mismatch" },
    });
    return res.status(401).json({ message: "Session invalid (IP mismatch)" });
  }

  req._sessionRecord = session; //attach for later use (e.g. extending)
  next();
}
