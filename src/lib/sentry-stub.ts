// Sentry stub — no-op replacement until Sentry is configured
export function captureException(err: unknown) {
  console.error('[Sentry stub]', err);
}
export function captureMessage(msg: string) {
  console.warn('[Sentry stub]', msg);
}
export function captureRequestError() {}
export function init() {}
