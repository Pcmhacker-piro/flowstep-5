import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.USER_API_KEY_SECRET;
  if (!raw) throw new Error("USER_API_KEY_SECRET is not set");
  // Derive a 32-byte AES-256-GCM key from the (arbitrary-length) env secret.
  return createHash("sha256").update(raw).digest();
}

export function encryptKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

export function last4(s: string): string {
  const t = s.trim();
  return t.length <= 4 ? t : t.slice(-4);
}
