export const maskEmail = (email = "") => {
  const [name, domain] = email.split("@");
  return name.length <= 2
    ? `***@${domain}`
    : `${name[0]}${"*".repeat(name.length - 2)}${name.slice(-1)}@${domain}`;
};

export const maskPAN = (pan = "") => {
  return pan.length === 10 ? `XXXXXX${pan.slice(6)}` : pan;
};
