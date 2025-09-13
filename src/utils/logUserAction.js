import logActivity from "../utils/logActivity.js";
import { maskEmail, maskPAN } from "./maskUtils.js";

const logUserAction = async (req, type, message, meta = {}) => {
  const userId = req?.user?.userId;
  if (!userId) return;

  const sanitizedMessage = message
    .replace(/([\w.-]+)@([\w.-]+)/g, (m) => maskEmail(m))
    .replace(/[A-Z]{5}[0-9]{4}[A-Z]/g, (m) => maskPAN(m));

  await logActivity(userId, type, sanitizedMessage, {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    platform: req.headers["x-platform"] || "unknown",
    ...meta,
  });
};

export default logUserAction;
