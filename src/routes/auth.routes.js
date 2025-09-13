import express from "express";
import validate from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendOtp, verifyOtp } from "../controllers/auth.controller.js";
import { sendOtpSchema, verifyOtpSchema } from "../validators/otpSchema.js";
import { otpSendLimiter, otpVerifyLimiter } from "../middlewares/limiters.js";

const router = express.Router();

router.post("/send-otp", validate(sendOtpSchema), otpSendLimiter, sendOtp);
router.post(
  "/verify-otp",
  validate(verifyOtpSchema),
  otpVerifyLimiter,
  verifyOtp
);



// Example protected check
router.get("/me", requireAuth, async (req, res) => {
  return res.json({ success: true, user: req.user });
});

export default router;
