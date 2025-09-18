// src/services/authService.js
import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";
import {
  createSessionAndTokens,
  issueRefreshRotation,
  reuseDetectionAndRevoke,
  revokeByRefreshToken,
  setRefreshCookie,
  readRefreshFromReq,
  requireCsrfIfCookie,
} from "./session.service.js";
import { generateUserId, normalizeUserFrom } from "../utils/userIdGenerator.js";
import { bootstrapUserAfterVerification } from "./userBootstrap.service.js";
import axios from "axios";
import nodemailer from "nodemailer";
import logUserAction from "../utils/logUserAction.js";

// OTP helpers
const { hash: bHash, compare: bCompare } = bcrypt;

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function otpTtlMinutes() {
  return 5;
}
function addMinutes(date, m) {
  const dt = new Date(date);
  dt.setMinutes(dt.getMinutes() + m);
  return dt;
}

async function sendSms(phone, message) {
  console.log("[sms]", phone, message);
  // // factor2sms service integration
  // const apiKey = process.env.TWOFACTOR_API_KEY;
  // const senderId = process.env.TWOFACTOR_SENDER_ID || "GoGoldZ";

  // if (!apiKey) {
  //   throw new Error("Missing TWOFACTOR_API_KEY in environment variables");
  // }

  // try {
  //   await axios.get(
  //     `https://2factor.in/API/V1/${apiKey}/SMS/${encodeURIComponent(
  //       phone
  //     )}/AUTOGEN/OTP1`
  //   );
  // } catch (err) {
  //   console.error("[2factor sms] Error sending SMS:", err.message);
  // }
}
async function sendEmail(email, subject, body) {
  console.log("[email]", email, subject, body);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"GoGoldZ" <no-reply@gogoldz.com>',
    to: email,
    subject,
    text: body,
  });
}

async function createOtpChallenge(channel, target) {
  const code = randomOtp();
  const codeHash = await bHash(code, 10);
  const expiresAt = addMinutes(new Date(), otpTtlMinutes());
  const challenge = await prisma.otpChallenge.create({
    data: { channel, target, codeHash, expiresAt },
  });
  if (channel === "PHONE")
    await sendSms(
      target,
      `Your GoGoldZ OTP is ${code}. It expires in 5 minutes.`
    );
  else
    await sendEmail(
      target,
      "Your GoGoldZ OTP",
      `OTP: ${code} (valid 5 minutes)`
    );
  return process.env.NODE_ENV === "development"
    ? { ...challenge, code }
    : challenge;
}

async function verifyOtpChallenge(
  channel,
  target,
  code,
  opts = {},
  req = null
) {
  const MAX_ATTEMPTS = Number.isInteger(opts.maxAttempts)
    ? opts.maxAttempts
    : 5;
  const ch = String(channel || "")
    .toUpperCase()
    .trim();
  const tg = String(target || "").trim();
  const cd = String(code || "").trim();
  if (ch !== "PHONE" && ch !== "EMAIL")
    throw Object.assign(new Error("Invalid channel"), { status: 400 });
  if (!/^\d{6}$/.test(cd))
    throw Object.assign(new Error("Invalid OTP format"), { status: 400 });

  const now = new Date();
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      channel: ch,
      target: tg,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  await logUserAction(
    req,
    "verify_otp",
    `OTP verification attempt for ${tg} via ${ch}`
  );
  if (!challenge) {
    await logUserAction(
      req,
      "verify_otp_failed",
      `OTP verification failed for ${tg} via ${ch}`
    );
    throw Object.assign(new Error("OTP not found or expired"), { status: 400 });
  }

  const ok = await bCompare(cd, challenge.codeHash);
  if (ok) {
    await prisma.$transaction([
      prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now, attempts: challenge.attempts + 1 },
      }),
      prisma.otpChallenge.updateMany({
        where: {
          channel: ch,
          target: tg,
          consumedAt: null,
          createdAt: { lte: challenge.createdAt },
        },
        data: { consumedAt: now },
      }),
    ]);
    return true;
  }

  const attempts = challenge.attempts + 1;
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: {
      attempts,
      ...(attempts >= MAX_ATTEMPTS ? { consumedAt: now } : {}),
    },
  });
  throw Object.assign(
    new Error(attempts >= MAX_ATTEMPTS ? "Too many attempts" : "Invalid OTP"),
    {
      status: attempts >= MAX_ATTEMPTS ? 429 : 400,
    }
  );
}

// ===== Handlers =====

export async function sendOtpService(req, res) {
  const { channel, target } = req.body || {};
  if (!channel || !target)
    return res
      .status(400)
      .json({ success: false, message: "channel and target required" });
  const ch = String(channel).toUpperCase();
  const otpChallenge = await createOtpChallenge(ch, target);
  await logUserAction(req, "send_otp", `OTP sent to ${target} via ${channel}`);
  return res.json({
    success: true,
    message: "OTP sent",
    otp: process.env.NODE_ENV === "development" ? otpChallenge.code : undefined,
    challengeId: otpChallenge.id,
    expiresAt: otpChallenge.expiresAt,
  });
}

export async function verifyOtpService(req, res, next) {
  try {
    const ch = String(req.body?.channel || "").toUpperCase();
    const target =
      req.body?.target || req.body?.phoneNumber || req.body?.email || "";
    const code = String(req.body?.code ?? req.body?.otp ?? "");
    if (!ch || !target || !code)
      return res
        .status(400)
        .json({ success: false, message: "channel, target, code required" });

    await verifyOtpChallenge(ch, target, code, req);

    // Find-or-create user by identity (phoneNumber/email) + business userId
    const whereIdentity =
      ch === "PHONE" ? { phoneNumber: target } : { email: target };
    let user = await prisma.user.findFirst({ where: whereIdentity });

    if (!user) {
      const rawFrom = (
        req.headers["x-user-from"] ||
        req.body?.userFrom ||
        process.env.USER_ID_PREFIX_DEFAULT ||
        "IND"
      ).toString();
      const prefix = normalizeUserFrom(rawFrom);

      for (let i = 0; i < 5; i++) {
        const newUserId = generateUserId(prefix);
        try {
          user = await prisma.user.create({
            data: { userId: newUserId, ...whereIdentity, isActive: true },
          });
          await logUserAction(
            req,
            "user_signup",
            `New user created: ${user.userId} (${target})`
          );
          await bootstrapUserAfterVerification(req, {
            userId: user.userId,
            channel: ch,
            target,
          });
          break;
        } catch (e) {
          if (e.code === "P2002") continue;
          throw e;
        }
      }
      if (!user)
        return res
          .status(500)
          .json({ success: false, message: "Failed to allocate userId" });
    }

    // Create session & tokens (JWT sub = business userId)
    const ua = req.headers["user-agent"] || null;
    const ip = req.ip || req.connection?.remoteAddress || null;
    const { session, accessToken, refreshToken } = await createSessionAndTokens(
      {
        user,
        userAgent: ua,
        ip,
        deviceName: null,
        platform: null,
      }
    );

    const fromWeb = (req.headers["x-client"] || "").toLowerCase() === "web";
    if (fromWeb) {
      setRefreshCookie(res, refreshToken);
      return res.json({
        success: true,
        accessToken,
        sessionId: session.id,
        userId: user.userId,
      });
    }
    return res.json({
      success: true,
      accessToken,
      refreshToken,
      sessionId: session.id,
      userId: user.userId,
    });
  } catch (err) {
    return next
      ? next(err)
      : res.status(500).json({ success: false, message: err.message });
  }
}

