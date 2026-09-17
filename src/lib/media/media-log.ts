// Structured, secret-safe logging for the outbound media pipeline.
// One JSON line per stage so a failed send can be traced end-to-end in the
// Vercel log stream by messageId / conversationId. Only whitelisted keys are
// emitted and free-text detail is scrubbed of URLs and bearer-style tokens —
// signed storage links and Meta access tokens must never reach the logs.

export type MediaLogEvent =
  | 'MEDIA_UPLOAD_STARTED'
  | 'MEDIA_UPLOAD_SUCCESS'
  | 'MEDIA_UPLOAD_FAILED'
  | 'MEDIA_STORAGE_SUCCESS'
  | 'MEDIA_STORAGE_FAILED'
  | 'MEDIA_PROVIDER_UPLOAD_STARTED'
  | 'MEDIA_PROVIDER_UPLOAD_SUCCESS'
  | 'MEDIA_PROVIDER_UPLOAD_FAILED'
  | 'MEDIA_SEND_STARTED'
  | 'MEDIA_SEND_SUCCESS'
  | 'MEDIA_SEND_FAILED'
  | 'MEDIA_SEND_DEDUPED'
  | 'MEDIA_RETRY_CLAIMED'
  | 'MEDIA_RETRY_REJECTED';

export interface MediaLogFields {
  tenantId?: string;
  conversationId?: string;
  messageId?: string;
  sendAs?: string;
  mimeType?: string;
  fileSize?: number;
  provider?: 'whatsapp' | 'instagram';
  providerMessageId?: string | null;
  deliveryMode?: 'media_id' | 'link';
  attempt?: number;
  errorCode?: string | number;
  errorStage?: string;
  fbtraceId?: string;
  reason?: string;
  detail?: string;
  durationMs?: number;
}

const ALLOWED_KEYS: (keyof MediaLogFields)[] = [
  'tenantId', 'conversationId', 'messageId', 'sendAs', 'mimeType', 'fileSize', 'provider',
  'providerMessageId', 'deliveryMode', 'attempt', 'errorCode', 'errorStage', 'fbtraceId',
  'reason', 'detail', 'durationMs',
];

export function redactSensitive(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\bEAA[A-Za-z0-9]{10,}/g, '[token]')
    .replace(/\b(Bearer|token=|access_token=)\s*[^\s&"']+/gi, '$1[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
    .slice(0, 300);
}

export function logMediaEvent(event: MediaLogEvent, fields: MediaLogFields): void {
  const line: Record<string, unknown> = { evt: event, ts: new Date().toISOString() };
  for (const key of ALLOWED_KEYS) {
    const value = fields[key];
    if (value === undefined || value === null || value === '') continue;
    line[key] = typeof value === 'string' ? redactSensitive(value) : value;
  }
  const json = JSON.stringify(line);
  if (event.endsWith('_FAILED') || event === 'MEDIA_RETRY_REJECTED') console.error(json);
  else console.log(json);
}
