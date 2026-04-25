import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:v1:';

// Hard-fail immediately if ENCRYPTION_KEY is missing or too short.
// This prevents silent data corruption where decryptToken returns garbage
// and that garbage gets sent to Meta's API causing silent 401s.
function getKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error('CRITICAL: ENCRYPTION_KEY is missing or too short (min 16 chars).');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts a plaintext string into a secure aes-256-gcm format.
 * Format: enc:v1:iv:authTag:encryptedData
 * 
 * Uses a dedicated prefix instead of colon-count heuristics to detect
 * already-encrypted values. This avoids false positives when a legitimate
 * Meta token happens to contain colons.
 */
export function encryptToken(text: string | null): string | null {
  if (!text) return null;
  if (text.startsWith(ENC_PREFIX)) return text; // already encrypted

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${ENC_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a previously encrypted token.
 * If it's not encrypted (legacy plain text without the enc:v1: prefix),
 * it returns it as-is for backwards compatibility.
 */
export function decryptToken(encryptedText: string | null): string | null {
  if (!encryptedText) return null;
  if (!encryptedText.startsWith(ENC_PREFIX)) return encryptedText; // legacy plaintext

  const rest = encryptedText.slice(ENC_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 3) return encryptedText; // malformed — treat as plaintext

  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('❌ Failed to decrypt token (check ENCRYPTION_KEY):', err);
    return encryptedText; // Fallback so we don't completely break if key rotates
  }
}
