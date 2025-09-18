const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err); // <-- prevents double send
  console.error(err); // or use a logger
  const isProd = process.env.NODE_ENV === "production";
  const message = isProd ? "Internal Server Error" : err.message || "Error";
  const status = err.statusCode || 500;
  res.status(status).json({ success: false, message });
};
export default errorHandler;
