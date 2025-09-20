import express from "express";
import Joi from "joi";

import validate from "../middlewares/validate.js";
import { requireAuth as auth } from "../auth/requireAuth.js";
import upload from "../middlewares/upload.js";
import updateProfileSchema from "../validators/updateProfileSchema.js";

import {
  setEmail,
  verifyEmail,
  getUserProfile,
  submitKYC,
  updateUserProfile,
  uploadProfilePicture,
} from "../controllers/user.controller.js";
import { normalizeToE164 } from "../utils/maskUtils.js";

// --- Schemas ---
const setEmailSchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\+?\d{10,13}$/)
    .required()
    .messages({
      "string.pattern.base": "Phone number must be 10 to 13 digits",
      "any.required": "Phone number is required",
    }),
  email: Joi.string().email().required().messages({
    "string.email": "Invalid email format",
    "any.required": "Email is required",
  }),
});

const verifyEmailSchema = Joi.object({
  phoneNumber: Joi.string()
    .custom(normalizeToE164, "phone normalization")
    .required()
    .messages({
      "string.pattern.base": "Phone number must be 10 to 15 digits",
      "any.required": "Phone number is required",
    }),
  token: Joi.string().min(1).required().messages({
    "string.empty": "Token cannot be empty",
    "any.required": "Token is required",
  }),
});

const verifyKYCSchema = Joi.object({
  panNumber: Joi.string()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid PAN number format",
      "any.required": "PAN number is required",
    }),
});

// --- Router ---
const router = express.Router();

// Email
router.post("/set-email", auth, validate(setEmailSchema), setEmail);
router.get("/verify-email", validate(verifyEmailSchema, "query"), verifyEmail);

// Profile
router.get("/profile", auth, getUserProfile);
router.patch(
  "/update-profile",
  auth,
  validate(updateProfileSchema),
  updateUserProfile
);

// Profile picture
router.post(
  "/upload-profile-picture",
  auth,
  upload.single("profilePicture"),
  uploadProfilePicture
);

// KYC
router.post("/submit-kyc", auth, validate(verifyKYCSchema), submitKYC);

export default router;
