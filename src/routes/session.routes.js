import { Router } from "express";
import Joi from "joi";
import {
  refreshLimiter,
  logoutLimiter,
  revokeLimiter,
} from "../middlewares/limiters.js";
import { requireCsrf } from "../middlewares/csrf.js";
import { requireAuth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import {
  refresh,
  logout,
  getSessions,
  revokeSession,
  revokeOthers,
} from "../controllers/session.controller.js";

const router = Router();

const revokeSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
});

const revokeOthersSchema = Joi.object({
  keepSessionId: Joi.string().uuid().required(),
});

router.post("/refresh", refreshLimiter, requireCsrf, refresh); // CSRF required only for cookie flow (controller enforces)
router.post("/logout", logoutLimiter, requireCsrf, logout);

router.get("/", requireAuth, getSessions);
router.post(
  "/revoke",
  revokeLimiter,
  requireAuth,
  requireCsrf,
  validate(revokeSchema, "body"),
  revokeSession
);
router.post(
  "/revoke-others",
  requireAuth,
  requireCsrf,
  validate(revokeOthersSchema, "body"),
  revokeOthers
);

export default router;
