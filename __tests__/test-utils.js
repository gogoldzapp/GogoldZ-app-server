import crypto, { randomUUID } from "crypto";
import request from "supertest";

import app from "../src/app.js";
import prisma from "../src/config/prisma.js";
import { createSessionAndTokens } from "../src/services/session.service.js";

const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "refresh_token";
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "csrf_token";
const REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || "/session";

export function makeServer() {
  return request.agent(app);
}

export async function resetDatabase() {
  await prisma.revokedRefreshToken.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.login.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(overrides = {}) {
  const suffix = overrides.suffix || crypto.randomBytes(4).toString("hex");
  return prisma.user.create({
    data: {
      userId: overrides.userId || randomUUID(),
      email: overrides.email || `user-${suffix}@example.com`,
      phoneNumber: overrides.phoneNumber || `+1555${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`,
      password: overrides.password || null,
      isVerified: overrides.isVerified || "verified",
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createUserSession(user, sessionOptions = {}) {
  const { session, accessToken, refreshToken } = await createSessionAndTokens({
    user,
    userAgent: sessionOptions.userAgent || "jest-agent",
    ip: sessionOptions.ip || "127.0.0.1",
    deviceName: sessionOptions.deviceName || "Jest Device",
    platform: sessionOptions.platform || "jest",
  });
  return { session, accessToken, refreshToken };
}

export function attachRefreshCookies(agent, refreshToken, csrfToken) {
  agent.jar.setCookie(`${REFRESH_COOKIE_NAME}=${refreshToken}; Path=${REFRESH_COOKIE_PATH}; HttpOnly`);
  if (csrfToken) {
    agent.jar.setCookie(`${CSRF_COOKIE_NAME}=${csrfToken}; Path=${REFRESH_COOKIE_PATH}`);
    agent.jar.setCookie(`csrfToken=${csrfToken}; Path=/`);
  }
}

export function primeCsrf(agent, value) {
  const token = value || crypto.randomBytes(12).toString("hex");
  agent.jar.setCookie(`csrfToken=${token}; Path=/`);
  agent.jar.setCookie(`${CSRF_COOKIE_NAME}=${token}; Path=${REFRESH_COOKIE_PATH}`);
  return token;
}

export async function simulateOtpLogin(agent, options = {}) {
  const user = await createTestUser(options.user || {});
  const { session, accessToken, refreshToken } = await createUserSession(user, options.session || {});
  if (agent && options.attachCookies !== false) {
    const csrfToken = primeCsrf(agent);
    attachRefreshCookies(agent, refreshToken, csrfToken);
    return { user, session, accessToken, refreshToken, csrfToken };
  }
  return { user, session, accessToken, refreshToken };
}

export { prisma, app };

