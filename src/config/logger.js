import pino from "pino";

const level = process.env.NODE_ENV === "production" ? "info" : "debug";

const logger = pino({
  level,
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { translateTime: "SYS:standard" },
        },
});

export default logger;
