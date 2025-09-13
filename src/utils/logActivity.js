import prisma from "../config/prisma.js";

const logActivity = async (userId, type, message, meta = {}) => {
  try {
    const exists = await prisma.user.findUnique({ where: { userId } });
    if (!exists) {
      console.warn("⚠️ Skipping log — userId not found:", userId);
      return;
    }
    await prisma.activity.create({
      data: {
        userId,
        type,
        message,
        ip: meta.ip || "unknown",
        userAgent: meta.userAgent || "unknown",
        platform: meta.platform || "unknown",
      },
    });
  } catch (err) {
    console.error("🔴 Failed to log activity:", err.message);
  }
};
export default logActivity;
