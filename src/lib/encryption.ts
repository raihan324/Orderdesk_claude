import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-unsafe-key-change-in-production";
const ALGORITHM = "aes-256-gcm";
const SALT = "orderdesk-salt"; // Stable salt for key derivation

/** Derive a stable 32-byte key from the master key. */
function getKey(): Buffer {
  return scryptSync(ENCRYPTION_KEY, SALT, 32);
}

/**
 * Encrypt a plaintext string. Returns "iv:ciphertext:authTag" where each part is hex-encoded.
 * Safe to store in the database.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16); // Random IV for each encryption
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Format: iv:ciphertext:authTag (all hex, colon-separated)
  return `${iv.toString("hex")}:${ciphertext}:${authTag.toString("hex")}`;
}

/**
 * Decrypt a string in the format "iv:ciphertext:authTag".
 * Throws if the encrypted value is invalid or has been tampered with.
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivHex, ciphertextHex, authTagHex] = encrypted.split(":");
  if (!ivHex || !ciphertextHex || !authTagHex) throw new Error("INVALID_ENCRYPTED_FORMAT");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertextHex, "hex", "utf8");
  plaintext += decipher.final("utf8");
  return plaintext;
}
