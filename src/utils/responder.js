export const ok = (res, message = "OK", data = null) =>
  res.status(200).json({ success: true, message, data });
export const bad = (res, message = "Bad Request", code = 400, data = null) =>
  res.status(code).json({ success: false, message, data });
export const unauthorized = (res, message = "Unauthorized", data = null) =>
  bad(res, message, data);
export const tooMany = (res, message = "Too many requests") =>
  bad(res, message, 429);
export const notFound = (res, message = "Not found") => bad(res, message, 404);
