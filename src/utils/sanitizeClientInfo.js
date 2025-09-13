const MAX = 256;
const clean = (s) => (typeof s === "string" ? s.slice(0, MAX) : null);

export default function sanitizeClientInfo(req) {
  return {
    ip: req.ip || "unknown",
    device: clean(req.headers["sec-ch-ua"]),
    platform:
      clean(req.headers["sec-ch-ua-platform"]) ||
      clean(req.headers["user-agent"]),
  };
}

// This function sanitizes client information from the request object.
