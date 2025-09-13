const DEFAULT_PREFIX = process.env.USER_ID_PREFIX_DEFAULT || "IND";
const DIGITS = parseInt(process.env.USER_ID_NUM_DIGITS || "6", 10);

export function normalizeUserFrom(input) {
  return (
    String(input || DEFAULT_PREFIX)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3) || DEFAULT_PREFIX
  );
}

export function generateUserId(userFrom) {
  const prefix = normalizeUserFrom(userFrom);
  const n = Math.floor(Math.random() * Math.pow(10, DIGITS));
  const serial = String(n).padStart(DIGITS, "0");
  return `${prefix}${serial}`; // e.g. IND004237
}
