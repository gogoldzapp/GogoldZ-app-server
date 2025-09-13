// src/config/validateConfig.js
import ms from "ms";
import config from "./index.js";

export default function validateConfig() {
  const errs = [];
  if (!config.jwt?.secret || typeof config.jwt.secret !== "string")
    errs.push("JWT_SECRET is missing/invalid.");

  if (ms(config.jwt?.accessTtl || "") == null)
    errs.push(`ACCESS_TOKEN_TTL invalid: "${config.jwt?.accessTtl}"`);
  if (ms(config.jwt?.refreshTtl || "") == null)
    errs.push(`REFRESH_TOKEN_TTL invalid: "${config.jwt?.refreshTtl}"`);

  if (config.jwt?.issuer && typeof config.jwt.issuer !== "string")
    errs.push("JWT_ISSUER must be a string.");
  if (config.jwt?.audience && typeof config.jwt.audience !== "string")
    errs.push("JWT_AUDIENCE must be a string.");

  if (errs.length)
    throw new Error("Configuration error(s):\n- " + errs.join("\n- "));
}
