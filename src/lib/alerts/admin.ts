// Critical-failure alert pipe to the platform owner.
//
// Channel: email via Resend → PLATFORM_ADMIN_EMAIL. Email was chosen because
// the most common alert source (WhatsApp send failure) means the WhatsApp
// channel itself is unreliable, so we can't dogfood sendStaffAlert for this.
//
// Debounced per dedupeKey to avoid hammering the inbox during a sustained
// outage. The debounce is in-process — multiple Vercel function instances may
// each fire one email per window, which is fine and arguably desirable.
//
// Every call is also forwarded to Sentry so the failure is captured even when
// email is unavailable (RESEND_API_KEY missing, Resend down, etc.).

import { Resend } from 'resend';
import * as Sentry from '@/lib/sentry-stub';

const WINDOW_MS = 5 * 60 * 1000;
const lastSent = new Map<string, number>();

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface AdminAlertInput {
  dedupeKey: string;
  subject: string;
  summary: string;
  context?: Record<string, unknown>;
}

export async function notifyAdmin(input: AdminAlertInput): Promise<void> {
  const { dedupeKey, subject, summary, context } = input;

  Sentry.captureMessage(`ADMIN_ALERT: ${subject} — ${summary}`, {
    level: 'error',
    extra: context,
  } as unknown as never);

  const now = Date.now();
  const last = lastSent.get(dedupeKey);
  if (last && now - last < WINDOW_MS) return;
  lastSent.set(dedupeKey, now);

  const to = process.env.PLATFORM_ADMIN_EMAIL;
  if (!to) {
    console.error('[admin alert] PLATFORM_ADMIN_EMAIL not set; alert dropped:', subject);
    return;
  }
  const resend = getResend();
  if (!resend) {
    console.error('[admin alert] RESEND_API_KEY not set; alert dropped:', subject);
    return;
  }

  const ctxHtml = context
    ? `<pre style="background:#f4f4f5;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;overflow-x:auto">${escapeHtml(JSON.stringify(context, null, 2))}</pre>`
    : '';

  try {
    await resend.emails.send({
      from: 'Aries AI Alerts <alerts@ariesai.in>',
      to,
      subject: `🚨 ${subject}`,
      html:
        `<div style="font-family:system-ui,sans-serif;max-width:640px">` +
        `<h2 style="color:#dc2626;margin:0 0 8px">${escapeHtml(subject)}</h2>` +
        `<p style="color:#374151;line-height:1.5">${escapeHtml(summary)}</p>` +
        ctxHtml +
        `<p style="color:#6b7280;font-size:12px;margin-top:16px">` +
        `Sent at ${new Date().toISOString()} · dedupe=${escapeHtml(dedupeKey)} · suppressing repeats for ${WINDOW_MS / 60000}m` +
        `</p></div>`,
    });
  } catch (err) {
    console.error('[admin alert] resend send failed:', (err as Error).message);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
