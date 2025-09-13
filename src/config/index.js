import path from "path";
import dotenv from "dotenv";
import ms from "ms";

// 1) Load base .env
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  example: path.resolve(process.cwd(), ".env.example"),
  allowEmptyValues: false,
});

// 2) Optionally load env-specific overrides
const envFile = `.env.${process.env.NODE_ENV}`;
dotenv.config({
  path: path.resolve(process.cwd(), envFile),
  override: true,
});

// 3) Export typed config values
export default {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 5000,
  isProd: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  DATABASE_URL: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER || undefined,
    audience: process.env.JWT_AUDIENCE || undefined,
    accessTtl: process.env.ACCESS_TOKEN_TTL,
    refreshTtl: process.env.REFRESH_TOKEN_TTL,
    clockTolerance: 5, // seconds
    accessCookieMaxAgeMs: ms(process.env.ACCESS_TOKEN_TTL || "15m"), // for res.cookie
    refreshCookieMaxAgeMs: ms(process.env.REFRESH_TOKEN_TTL || "7d"),
  },
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
  },
  aws: {
    s3Bucket: process.env.AWS_S3_BUCKET,
  },
  appUrl: process.env.APP_URL,
  encryptionKey: process.env.ENCRYPTION_KEY,

  cookie: process.env.COOKIE_SECRET,
  cors: {
    allowlist: (process.env.CORS_ORIGIN || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  // metrics: {
  //   key: need("METRICS_KEY"), // simple key to protect /metrics endpoint
  // },
};
