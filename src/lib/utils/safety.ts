// ═══════════════════════════════════════════════════════════
// 🛡️ Error Handling — Crash-Proof Utilities
// ═══════════════════════════════════════════════════════════
// The bot should NEVER crash. These utilities ensure every
// operation is wrapped in error boundaries with logging.
// ═══════════════════════════════════════════════════════════

// ── Safe async wrapper — catches all errors ──
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.error(`❌ [${context}]`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

// ── Retry wrapper — retries on failure ──
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoff?: boolean;
    context?: string;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true, context = 'operation' } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ [${context}] Failed after ${maxRetries} attempts`);
        throw error;
      }

      const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
      console.warn(`⚠️ [${context}] Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error('Unreachable');
}

// ── Timeout wrapper — fails if too slow ──
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback?: T
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fallback !== undefined) {
        resolve(fallback);
      } else {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        if (fallback !== undefined) {
          resolve(fallback);
        } else {
          reject(error);
        }
      });
  });
}

// ── Rate limiter — per-key limits ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

if (typeof setInterval !== 'undefined') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  }, 60000);
  if (cleanup.unref) cleanup.unref();
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

// ── Sleep utility ──
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Sanitize input ──
export function sanitizeInput(input: string, maxLength = 2000): string {
  return input
    .slice(0, maxLength)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// ── Validate phone number ──
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

// ── Validate email ──
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
