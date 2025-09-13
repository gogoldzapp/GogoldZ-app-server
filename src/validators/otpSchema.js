"use strict";
import Joi from "joi"; // or "@hapi/joi"

const phone = Joi.string()
  .pattern(/^\+?\d{10,13}$/)
  .messages({
    "string.pattern.base":
      "Phone number must be 10 to 13 digits, optionally starting with +",
    "string.empty": "Phone number cannot be empty",
  });

const email = Joi.string()
  .email({ tlds: { allow: false } })
  .messages({
    "string.email": "Email is invalid",
    "string.empty": "Email cannot be empty",
  });

const channelSchema = Joi.string().valid("PHONE", "EMAIL").required();

/** SEND OTP */
export const sendOtpSchema = Joi.object({
  channel: channelSchema,
  // ✅ use a REF, not a schema, in the condition:
  target: Joi.alternatives().conditional(Joi.ref("channel"), {
    is: "PHONE",
    then: phone.required(),
    otherwise: email.required(),
  }),
  // legacy support
  phoneNumber: phone.optional(),
})
  .custom((value) => {
    // Map legacy { phoneNumber } → { channel:"PHONE", target: phoneNumber }
    if (!value.channel && value.phoneNumber) value.channel = "PHONE";
    if (!value.target && value.phoneNumber) {
      value.target = value.phoneNumber;
      delete value.phoneNumber;
    }
    return value;
  })
  .prefs({ abortEarly: false, stripUnknown: true });

/** VERIFY OTP */
export const verifyOtpSchema = Joi.object({
  channel: channelSchema,
  target: Joi.alternatives().conditional(Joi.ref("channel"), {
    is: "PHONE",
    then: phone.required(),
    otherwise: email.required(),
  }),
  // prefer 'code', allow legacy 'otp'
  code: Joi.string()
    .pattern(/^\d{6}$/)
    .messages({
      "string.pattern.base": "OTP must be 6 digits",
    }),
  otp: Joi.string()
    .pattern(/^\d{6}$/)
    .optional(),
  // legacy
  phoneNumber: phone.optional(),
})
  .custom((value) => {
    if (!value.channel && value.phoneNumber) value.channel = "PHONE";
    if (!value.target && value.phoneNumber) {
      value.target = value.phoneNumber;
      delete value.phoneNumber;
    }
    if (!value.code && value.otp) {
      value.code = value.otp;
      delete value.otp;
    }
    return value;
  })
  .prefs({ abortEarly: false, stripUnknown: true });

export const updatePasswordSchema = Joi.object({
  userId: Joi.string().required().messages({
    "any.required": "User ID is required",
  }),
  newPassword: Joi.string().min(10).max(16).required().messages({
    "string.min": "Password must be at least 10 characters long",
    "string.max": "Password must be at most 16 characters long",
    "any.required": "Password is required",
  }),
});
