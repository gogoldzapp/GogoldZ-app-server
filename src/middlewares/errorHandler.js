const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err); // <-- prevents double send
  console.error(err); // or use a logger
  const isProd = process.env.NODE_ENV === "production";
  //App logger if present, otherwise fall back
  const logger = req.app?.get?.("logger");
  if (logger) {
    // minimize leakage of sensitive info in prod logs
    if (isProd) {
      logger.error({
        path: req.originalUrl,
        method: req.method,
        code: err.statusCode || 500,
        message: err.message || "Error",
      });
    } else {
      logger.error({ err }, "Unhandled error (development)");
    }
  } else {
    if (!isProd) console.error(err);
  }
  const message = isProd ? "Internal Server Error" : err.message || "Error";
  const status = err.statusCode || 500;
  res.status(status).json({ success: false, message });
};
export default errorHandler;
