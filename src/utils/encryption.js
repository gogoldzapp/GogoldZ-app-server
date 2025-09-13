import crypto from "crypto";
import config from "../config/index.js"; // for ENCRYPTION_KEY from .env

const algorithm = "aes-256-cbc";
const key = Buffer.from(config.encryptionKey, "hex"); // 32 bytes key (64 hex chars)
const ivLength = 16; // AES block size

export const encrypt = (text) => {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

export const decrypt = (data) => {
  const [ivHex, encryptedText] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};
