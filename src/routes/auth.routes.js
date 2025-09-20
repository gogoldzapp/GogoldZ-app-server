import express from "express";
import validate from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import {
  sendOtp,
  verifyOtp,
  updatePassword,
} from "../controllers/auth.controller.js";
import {
  sendOtpSchema,
  verifyOtpSchema,
  updatePasswordSchema,
} from "../validators/otpSchema.js";
import {
  otpSendLimiter,
  otpVerifyLimiter,
  passwordUpdateLimiter,
} from "../middlewares/limiters.js";

const router = express.Router();

router.post("/send-otp", validate(sendOtpSchema), otpSendLimiter, sendOtp);
router.post(
  "/verify-otp",
  validate(verifyOtpSchema),
  otpVerifyLimiter,
  verifyOtp
);
router.post(
  "/update-password",
  requireAuth,
  validate(updatePasswordSchema),
  passwordUpdateLimiter,
  updatePassword
);


// Example protected check
router.get("/me", requireAuth, async (req, res) => {
  return res.json({ success: true, user: req.user });
});

export default router;
