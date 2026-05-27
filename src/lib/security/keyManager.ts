// ═══════════════════════════════════════════════════════════
// 🔐 Encryption Key Manager — Versioned Key Rotation
// ═══════════════════════════════════════════════════════════
// Supports multi-version encryption keys so a compromised key
// can be rotated WITHOUT breaking existing encrypted rows.
//
// ENV CONFIG:
//   ENCRYPTION_KEYS='{"v1":"old_key","v2":"new_current_key"}'
//   CURRENT_ENCRYPTION_VERSION=v2
//
// Stored token format:  enc:v2:iv:authTag:ciphertext
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:';

// ─── Key store ────────────────────────────────────────────────
function getKeyStore(): Record<string, string> {
  const raw = process.env.ENCRYPTION_KEYS;
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      throw new Error('CRITICAL: ENCRYPTION_KEYS env var is not valid JSON');
    }
  }
  // Fallback: single-key mode for backwards compatibility
  const legacy = process.env.ENCRYPTION_KEY;
  if (!legacy || legacy.length < 16) {
    throw new Error('CRITICAL: No ENCRYPTION_KEYS or ENCRYPTION_KEY env var set (min 16 chars)');
  }
  return { v1: legacy };
}

function getCurrentVersion(): string {
  return process.env.CURRENT_ENCRYPTION_VERSION ?? 'v1';
}

function deriveKey(rawKey: string): Buffer {
  return crypto.createHash('sha256').update(String(rawKey)).digest();
}

// ─── Encrypt ──────────────────────────────────────────────────
// Always uses CURRENT_ENCRYPTION_VERSION
export function encryptTokenV2(text: string | null): string | null {
  if (!text) return null;
  if (text.startsWith(PREFIX)) return text; // already encrypted

  const version = getCurrentVersion();
  const store = getKeyStore();
  const rawKey = store[version];
  if (!rawKey) throw new Error(`CRITICAL: No key found for version "${version}"`);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(rawKey), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${version}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// ─── Decrypt ──────────────────────────────────────────────────
// Inspects version prefix and selects the right key
export function decryptTokenV2(encryptedText: string | null): string | null {
  if (!encryptedText) return null;

  // Legacy single-key format: enc:v1:iv:authTag:cipher (4 colons after enc:)
  // New multi-key format:     enc:v2:iv:authTag:cipher (same structure)
  if (!encryptedText.startsWith(PREFIX)) {
    return encryptedText; // plaintext, never encrypted — legacy compat
  }

  const withoutPrefix = encryptedText.slice(PREFIX.length); // "v2:iv:authTag:cipher"
  const firstColon = withoutPrefix.indexOf(':');
  if (firstColon === -1) return encryptedText;

  const version = withoutPrefix.slice(0, firstColon);
  const rest = withoutPrefix.slice(firstColon + 1); // "iv:authTag:cipher"
  const parts = rest.split(':');
  if (parts.length !== 3) return encryptedText; // malformed

  const store = getKeyStore();
  const rawKey = store[version];
  if (!rawKey) {
    console.error(`❌ decryptTokenV2: No key found for version "${version}" — cannot decrypt`);
    return null; // hard fail rather than returning garbage
  }

  try {
    const [ivHex, authTagHex, cipherHex] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(rawKey), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error(`❌ decryptTokenV2 v${version} failed:`, (err as Error).message);
    return null;
  }
}

// ─── Is encrypted with current version? ──────────────────────
export function isCurrentVersion(value: string): boolean {
  return value.startsWith(`${PREFIX}${getCurrentVersion()}:`);
}

// ─── Needs re-encryption? ─────────────────────────────────────
export function needsRotation(value: string): boolean {
  if (!value.startsWith(PREFIX)) return false; // plaintext, needs encryption
  return !isCurrentVersion(value);
}
