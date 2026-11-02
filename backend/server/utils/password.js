// backend/server/utils/password.js
import crypto from "crypto";

const SCRYPT_KEY_LENGTH = 64;

/**
 * Hash a plain password using crypto.scrypt
 * Returns format: "scrypt:<salt_hex>:<hash_hex>"
 */
export function hashPassword(password) {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plain password against stored hash
 */
export function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, expectedHashHex] = parts;
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  const expectedBuffer = Buffer.from(expectedHashHex, "hex");

  if (derivedKey.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, expectedBuffer);
}
