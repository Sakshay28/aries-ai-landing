// Test setup: provide deterministic env vars for crypto/webhook modules
// that hard-fail at import or call time when env is missing.
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  'test-encryption-key-do-not-use-in-production-please';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test-app-secret';
