/**
 * Credential storage.
 *
 * ── Read this before relying on it ─────────────────────────────────────────
 * Stored passwords are encrypted at rest with AES-256-GCM using a key derived
 * from APP_SECRET. That defeats casual exposure: a leaked database file, a
 * backup on a shared drive, or someone reading over your shoulder.
 *
 * It does NOT defeat an attacker who has both the database and the server's
 * environment variables, because the application must be able to decrypt on
 * demand to show you the password. This is a convenience store, not a
 * password manager. For anything that would be damaging to lose, keep the real
 * credential in your organisation's password manager and use the
 * `credentialLocation` field to record where it lives.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'APP_SECRET is missing or too short. Set a random string of at least 32 characters in your environment before storing credentials.',
    );
  }
  // Fixed salt: the secret is already high-entropy and per-deployment, and a
  // rotating salt would prevent decryption of previously stored values.
  return scryptSync(secret, 'imperial-subs-credential-store', 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

/**
 * Base64 decoding in Node is lenient: it silently discards characters it does
 * not recognise. That means a corrupted payload can decode to valid-looking
 * bytes and pass authentication, which is not the behaviour you want from
 * something guarding a credential. Each segment is therefore validated for
 * shape first, and rejected outright if it does not round-trip exactly.
 */
function strictBase64(segment: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(segment)) return null;
  const buf = Buffer.from(segment, 'base64');
  if (buf.toString('base64') !== segment) return null;
  return buf;
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  const iv = strictBase64(parts[1]);
  const tag = strictBase64(parts[2]);
  const data = strictBase64(parts[3]);

  // AES-GCM uses a 96-bit nonce and a 128-bit authentication tag. Anything else
  // is a malformed record, not a decryption problem.
  if (!iv || !tag || !data || iv.length !== 12 || tag.length !== 16) return null;

  try {
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null; // wrong key, or the ciphertext was altered
  }
}

export function hasSecret(payload: string | null | undefined): boolean {
  return typeof payload === 'string' && payload.startsWith(`${VERSION}.`);
}

/** Rough strength signal shown next to a stored password. Not a security control. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: 'None' };
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: labels[s] };
}
