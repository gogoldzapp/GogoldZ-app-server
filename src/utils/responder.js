export const ok = (res, message, data) =>
  res.status(200).json({ success: true, message, data });
export const bad = (res, message, code = 400) =>
  res.status(code).json({ success: false, message });
export const unauthorized = (res, message = "Unauthorized") =>
  bad(res, message, 401);
export const tooMany = (res, message = "Too many requests") =>
  bad(res, message, 429);
export const notFound = (res, message = "Not found") => bad(res, message, 404);
