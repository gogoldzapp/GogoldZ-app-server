import crypto from "crypto";
import transporter from "../utils/mailer.js";
import prisma from "../config/prisma.js";
import logUserAction from "../utils/logUserAction.js";
import { maskEmail, maskPAN } from "../utils/maskUtils.js";
import { encrypt } from "../utils/encryption.js";

export const setEmailService = async (req, phoneNumber, email) => {
  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  if (!user) return { error: "User not found", status: 404 };

  const token = crypto.randomBytes(16).toString("hex");
  await prisma.user.update({
    where: { userId: user.userId },
    data: { email },
  });
  await prisma.userDetails.update({
    where: { userId: user.userId },
    data: {
      emailVerified: false,
      emailVerificationToken: token,
    },
  });

  await logUserAction(
    req,
    "updating_email",
    `Email set for user ${phoneNumber}`
  );

  const verifyLink = `${process.env.APP_URL}/api/user/verify-email?phoneNumber=${phoneNumber}&token=${token}`;

  await transporter.sendMail({
    from: `"FinApp" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify your email to secure your account",
    text: [
      "Hi there,",
      "",
      "Please verify your email address for FinApp.",
      "Click the link below (or paste it into your browser):",
      verifyLink,
      "",
      "If you didn’t request this, you can safely ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#111;">
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-weight:700;font-size:20px;letter-spacing:.2px;">FinApp</div>
        </div>

        <h1 style="font-size:20px;margin:0 0 12px;">Verify your email</h1>
        <p style="margin:0 0 16px;line-height:1.6;">
          Hi${
            user?.fullName ? " " + user.fullName.split(" ")[0] : ""
          }, please confirm that
          <strong>${email}</strong> is your email address for your FinApp account.
        </p>

        <p style="text-align:center;margin:24px 0;">
          <a href="${verifyLink}"
             style="display:inline-block;padding:12px 18px;border-radius:8px;text-decoration:none;background:#2563eb;color:#fff;font-weight:600;">
            Verify email
          </a>
        </p>

        <p style="margin:0 0 12px;line-height:1.6;">
          Or copy and paste this link into your browser:
        </p>
        <p style="word-break:break-all;background:#f6f7f9;padding:10px;border-radius:6px;margin:0 0 16px;">
          <a href="${verifyLink}" style="color:#2563eb;text-decoration:none;">${verifyLink}</a>
        </p>

        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />

        <p style="font-size:12px;color:#555;line-height:1.6;margin:0;">
          If you didn’t request this, you can safely ignore this email. This link will only work for your account.
        </p>
      </div>
    `,
  });

  return { message: `Verification email sent to ${email}` };
};

export const verifyEmailService = async (req, phoneNumber, token) => {
  // console log for phoneNumber
  console.log("Verifying email for phoneNumber:", phoneNumber);
  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  console.log("User found:", user);
  if (!user) return { error: "User not found", status: 404 };
  const userDetails = await prisma.userDetails.findUnique({
    where: { userId: user.userId },
  });
  if (!userDetails || userDetails.emailVerificationToken !== token)
    return { error: "Invalid token or phoneNumber", status: 400 };

  //Update userDetails table with @email.
  await prisma.userDetails.update({
    where: { userId: user.userId },
    data: { emailVerified: true, emailVerificationToken: null },
  });

  //Update Login table with @email, once @email is verified.
  await prisma.login.updateMany({
    where: { userId: user.userId },
    data: { email: user.email },
  });

  await logUserAction(
    req,
    "email_verification",
    `Email verified for ${phoneNumber}`
  );
  return { message: "Email successfully verified" };
};

export const getUserProfileService = async (userId) => {
  const user = await prisma.userDetails.findUnique({ where: { userId } });
  if (!user) return { error: "User not found", status: 404 };

  return {
    fullName: user.fullName,
    dob: user.dob,
    gender: user.gender,
    addressLine1: user.addressLine1,
    city: user.city,
    state: user.state,
    country: user.country,
    postalCode: user.postalCode,
    profilePicture: user.profilePicture,
    email: user.email ? maskEmail(user.email) : null,
    phoneNumber: user.phoneNumber,
    panNumber: user.panNumber ? maskPAN(user.panNumber) : null,
    kycStatus: user.kycStatus,
  };
};

export const updateUserProfileService = async (req, userId, data) => {
  const user = await prisma.userDetails.findUnique({ where: { userId } });
  if (!user) return { error: "User not found", status: 404 };

  const updatePayload = {};
  if (data.fullName) updatePayload.fullName = data.fullName;
  if (data.dob) updatePayload.dob = new Date(data.dob);
  if (data.gender) updatePayload.gender = data.gender;
  if (data.addressLine1) updatePayload.addressLine1 = data.addressLine1;
  if (data.city) updatePayload.city = data.city;
  if (data.state) updatePayload.state = data.state;
  if (data.country) updatePayload.country = data.country;
  if (data.postalCode) updatePayload.postalCode = data.postalCode;

  const updatedUser = await prisma.userDetails.update({
    where: { userId },
    data: updatePayload,
  });
  await logUserAction(
    req,
    "profile_update",
    `Profile updated for user ${userId}`
  );

  return updatedUser;
};

export const uploadProfilePictureService = async (req, userId, file) => {
  if (!file) return { error: "No file uploaded", status: 400 };

  const user = await prisma.userDetails.findUnique({ where: { userId } });
  if (!user) return { error: "User not found", status: 404 };

  const filePath = `/uploads/profile-pics/${file.filename}`;
  await prisma.userDetails.update({
    where: { userId },
    data: { profilePicture: filePath },
  });

  await logUserAction(
    req,
    "profile_picture_upload",
    `Profile picture uploaded for user ${userId}`
  );
  return {
    message: "Profile picture uploaded successfully",
    profilePicture: filePath,
  };
};

export const submitKYCService = async (req, userId, panNumber) => {
  const user = await prisma.userDocuments.findUnique({ where: { userId } });
  if (!user) return { error: "User not found", status: 404 };

  if (user.kycStatus === "verified")
    return { error: "KYC already verified", status: 400 };

  const encryptedPan = encrypt(panNumber);
  const maskedPan = maskPAN(panNumber);

  await prisma.userDocuments.update({
    where: { userId },
    data: {
      panNumber: encryptedPan,
    },
  });

  //Update KycStatus in User
  await prisma.user.update({
    where: { userId: userId },
    data: { isVerified: "uploaded" },
  });

  await logUserAction(
    req,
    "kyc_submission",
    `KYC submitted for user ${userId} with PAN ${maskedPan}`
  );
  return {
    message: "KYC submitted successfully",
    kycStatus: "uploaded",
    panMasked: maskedPan,
  };
};
