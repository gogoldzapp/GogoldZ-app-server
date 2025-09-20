import bcrypt from "bcryptjs";

export const maskEmail = (email = "") => {
  const [name, domain] = email.split("@");
  return name.length <= 2
    ? `***@${domain}`
    : `${name[0]}${"*".repeat(name.length - 2)}${name.slice(-1)}@${domain}`;
};

export const maskPAN = (pan = "") => {
  return pan.length === 10 ? `XXXXXX${pan.slice(6)}` : pan;
};

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const normalizeToE164 = (value, helpers) => {
  const DEFAULT_CC = process.env.DEFAULT_COUNTRY_CODE || "+91";

  // Stringify, trim, and strip spaces, dashes, parentheses, dots
  const raw = String(value ?? "").trim();
  let v = raw.replace(/[\s\-().]/g, "");

  // Convert leading 00 to +
  if (v.startsWith("00")) v = "+" + v.slice(2);

  // If it starts with digits only (no '+'), keep for now
  // Remove any non-digit except leading '+'
  if (v.startsWith("+")) {
    v = "+" + v.slice(1).replace(/\D/g, "");
  } else {
    v = v.replace(/\D/g, "");
  }

  // If it's a 10-digit local number, prepend default country code
  if (!v.startsWith("+") && v.length === 10) {
    v = DEFAULT_CC + v;
  }

  // If it still doesn't start with '+', but length looks like intl (11-15), add '+'
  if (!v.startsWith("+") && v.length >= 11 && v.length <= 15) {
    v = "+" + v;
  }

  // Final strict check: + and 10–15 digits total
  if (!/^\+\d{10,15}$/.test(v)) {
    return helpers.error("any.invalid", {
      message: "Phone number must be 10 to 15 digits",
    });
  }

  return v; // normalized E.164
};

 