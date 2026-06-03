// Real Sentry wrapper — all existing imports work unchanged.
// Activate by setting SENTRY_DSN in environment variables.
export {
  captureException,
  captureMessage,
  init,
} from '@sentry/nextjs';

// captureRequestError is only available in newer SDK versions — stub it if missing
export function captureRequestError(..._args: unknown[]) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const s = require('@sentry/nextjs');
    if (typeof s.captureRequestError === 'function') s.captureRequestError(..._args);
  } catch {}
}
