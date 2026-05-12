import * as crypto from "crypto";

/**
 * Encrypts shopkeeper-supplied secrets (e.g. Razorpay Direct keys) at rest.
 *
 * Key derivation: prefers SECRETS_ENCRYPTION_KEY (recommended for production
 * so JWT-secret rotation doesn't brick stored secrets). Falls back to
 * JWT_ACCESS_SECRET for back-compat with data encrypted before this split.
 * Throws if neither is set — never silently uses a known dev string.
 *
 * Output format: base64( iv[12] || authTag[16] || ciphertext ).
 *
 * Key rotation: change SECRETS_ENCRYPTION_KEY → existing encrypted secrets
 * become undecryptable. Implement a re-encryption migration before rotating.
 */

const ALGO = "aes-256-gcm";

function masterKey(): Buffer {
  const seed =
    process.env.SECRETS_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
  if (!seed) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY (or JWT_ACCESS_SECRET) must be set to encrypt/decrypt stored secrets.",
    );
  }
  return crypto.scryptSync(seed, "razorpay-direct-keys-v1", 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(blob: string): string {
  if (!blob) return "";
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
