import pino from "pino";
import pinoHttp from "pino-http";
//import { config } from "./config-legacy.js";
import config from "./config/index.js";

// Base logger
export const ILogger = pino({
  level: config.LOG_LEVEL || "info",
  transport:
    config.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
  base: { app: "gogoldz-api", env: config.NODE_ENV },
  redact: {
    // mask sensitive fields automatically
    paths: [
      "req.headers.authorization",
      "req.body.panNumber",
      "req.body.email",
      "req.body.phoneNumber",
    ],
    censor: "***",
  },
});

// Express HTTP logger middleware
export const httpLogger = pinoHttp({
  logger: ILogger,
  autoLogging: { ignore: (req) => req.url === "/healthz" }, // optional: drop noisy health checks
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info"; // 1xx/2xx/3xx => info
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    return `ERR ${req.method} ${req.url} ${res.statusCode || ""} ${
      err?.message || ""
    }`.trim();
  },
  serializers: {
    req(req) {
      return { method: req.method, url: req.url, id: req.id };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
