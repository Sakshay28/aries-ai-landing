import { verifySignature } from '@/lib/meta/service';

// Which App Secret a Meta webhook signature was made with.
//
// A tenant on their own Meta app has wa_app_secret set; everyone else is on the
// platform app (META_APP_SECRET). A client's number can end up delivering through
// the platform app (or the client resets their app secret) without wa_app_secret
// being updated — Mezo Jaipur's webhooks 401'd from 2026-10-29 that way. Both
// secrets are ours, so accepting either keeps the authenticity guarantee; the
// caller logs a 'platform' match on a tenant with its own secret so the stale
// value gets fixed.
export type WebhookSecretMatch = 'tenant' | 'platform' | null;

export function matchWebhookSecret(
  rawBody: string,
  signature: string | null,
  tenantSecret: string | null,
  platformSecret: string | null,
): WebhookSecretMatch {
  if (!signature) return null;
  if (tenantSecret && verifySignature(rawBody, signature, tenantSecret)) return 'tenant';
  if (platformSecret && platformSecret !== tenantSecret && verifySignature(rawBody, signature, platformSecret)) return 'platform';
  return null;
}
