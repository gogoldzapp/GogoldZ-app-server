// single source of truth for environment variables (STRICT, whitelisted)
import dotenv from "dotenv";
import fs from "fs";
import Joi from "joi";

/* 1) Load .env then overlay env-specific file */
if (fs.existsSync(".env")) {
  dotenv.config({ path: ".env", override: true });
  console.log("✅ Base config loaded");
}
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  console.log(`✅ ${envFile} loaded`);
} else {
  console.log(`ℹ️ ${envFile} not found, using .env only`);
}

/* 2) Joi schema (ONLY the vars we care about) */
const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "staging", "production")
    .default("development"),
  LOG_LEVEL: Joi.string()
    .valid("fatal", "error", "warn", "info", "debug", "trace", "silent")
    .default("info"),

  // Core DB
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),

  // Supabase
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().min(20).required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().min(20).required(),

  // Server basics
  PORT: Joi.number().port().default(5000),
  APP_URL: Joi.string().uri().optional(),
  CORS_ORIGIN: Joi.string().optional(), // comma or space separated if you handle parsing later

  // If you still use your own JWT/refresh (optional)
  JWT_SECRET: Joi.string().min(16).optional(),
  JWT_ISSUER: Joi.string().optional(),
  JWT_AUDIENCE: Joi.string().optional(),
  ACCESS_TOKEN_TTL: Joi.string().optional(), // e.g. "15m"
  REFRESH_TOKEN_TTL: Joi.string().optional(), // e.g. "7d"

  // Crypto / cache (optional)
  ENCRYPTION_KEY: Joi.string().optional(),
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.number().port().optional(),

  // SMTP (optional)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),

  // Feature flags
  ENABLE_EDGE_FUNCTIONS: Joi.boolean()
    .truthy("true", "1")
    .falsy("false", "0")
    .default(false),
}).prefs({ abortEarly: false, convert: true }); // no unknown() here because we won't pass unknowns anyway

/* 3) Build a strict INPUT subset (whitelisted) */
const INPUT = {
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,

  DATABASE_URL: process.env.DATABASE_URL,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  PORT: process.env.PORT,
  APP_URL: process.env.APP_URL,
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_ISSUER: process.env.JWT_ISSUER,
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL,

  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,

  ENABLE_EDGE_FUNCTIONS: process.env.ENABLE_EDGE_FUNCTIONS,
};

/* 4) Validate, normalize, and export */
function mask(v, visible = 4) {
  if (!v) return "";
  const s = String(v);
  if (s.length <= visible * 2)
    return "*".repeat(Math.max(0, s.length - 2)) + s.slice(-2);
  return s.slice(0, visible) + "…" + s.slice(-visible);
}

let cached;

export function loadConfig() {
  if (cached) return cached;

  const { value, error } = schema.validate(INPUT);
  if (error) {
    const details = error.details.map((d) => ` - ${d.message}`).join("\n");
    throw new Error(`Config validation failed:\n${details}`);
  }

  cached = {
    NODE_ENV: value.NODE_ENV,
    LOG_LEVEL: value.LOG_LEVEL,

    DATABASE_URL: value.DATABASE_URL,

    SUPABASE_URL: value.SUPABASE_URL,
    SUPABASE_ANON_KEY: value.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: value.SUPABASE_SERVICE_ROLE_KEY,

    PORT: value.PORT,
    APP_URL: value.APP_URL,
    CORS_ORIGIN: value.CORS_ORIGIN,

    JWT: {
      secret: value.JWT_SECRET,
      issuer: value.JWT_ISSUER,
      audience: value.JWT_AUDIENCE,
      accessTtl: value.ACCESS_TOKEN_TTL,
      refreshTtl: value.REFRESH_TOKEN_TTL,
    },

    CRYPTO: {
      encryptionKey: value.ENCRYPTION_KEY,
    },

    REDIS: {
      host: value.REDIS_HOST,
      port: value.REDIS_PORT,
    },

    SMTP: {
      host: value.SMTP_HOST,
      port: value.SMTP_PORT,
      user: value.SMTP_USER,
      pass: value.SMTP_PASS,
    },

    FLAGS: {
      enableEdgeFns: value.ENABLE_EDGE_FUNCTIONS,
    },

    _mask: mask,
  };

  return cached;
}

export const config = loadConfig();

/* 5) Safe summary for logs/CI */
export function summarizeConfigSafe() {
  const c = config;
  return {
    env: c.NODE_ENV,
    logLevel: c.LOG_LEVEL,
    databaseUrl: c._mask(c.DATABASE_URL),
    supabase: {
      url: c.SUPABASE_URL,
      anonKey: c._mask(c.SUPABASE_ANON_KEY),
      serviceRoleKey: c._mask(c.SUPABASE_SERVICE_ROLE_KEY),
    },
    server: {
      port: c.PORT,
      appUrl: c.APP_URL,
      corsOrigin: c.CORS_ORIGIN,
    },
    jwt: {
      issuer: c.JWT.issuer,
      audience: c.JWT.audience,
      accessTtl: c.JWT.accessTtl,
      refreshTtl: c.JWT.refreshTtl,
      secret: c._mask(c.JWT.secret),
    },
    redis: {
      host: c.REDIS.host,
      port: c.REDIS.port,
    },
    smtp: {
      host: c.SMTP.host,
      port: c.SMTP.port,
      user: c.SMTP.user,
      pass: c._mask(c.SMTP.pass),
    },
    flags: c.FLAGS,
  };
}
