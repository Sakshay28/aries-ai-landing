// Email alert to the TENANT (business owner), not the platform operator.
// Mirrors notifyAdmin's shape (src/lib/alerts/admin.ts) but has no debounce —
// callers are expected to already be rate-limited (e.g. the staff-keepalive
// cron only calls this once per dedup window).

import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface TenantAlertInput {
  staffEmail: string;
  businessName: string;
  subject: string;
  summary: string;
}

export async function notifyTenant(input: TenantAlertInput): Promise<void> {
  const { staffEmail, businessName, subject, summary } = input;
  const resend = getResend();
  if (!resend) {
    console.warn('[tenant alert] RESEND_API_KEY not set; alert dropped:', subject);
    return;
  }

  try {
    await resend.emails.send({
      from: 'Aries AI Alerts <alerts@ariesai.in>',
      to: staffEmail,
      subject: `⚠️ ${subject}`,
      html:
        `<div style="font-family:system-ui,sans-serif;max-width:560px">` +
        `<h2 style="color:#d97706;margin:0 0 8px">${escapeHtml(subject)}</h2>` +
        `<p style="color:#374151;line-height:1.5">${escapeHtml(summary)}</p>` +
        `<p style="color:#6b7280;font-size:12px;margin-top:16px">${escapeHtml(businessName)} · Aries AI · ${new Date().toISOString()}</p>` +
        `</div>`,
    });
  } catch (err) {
    console.error('[tenant alert] resend send failed:', (err as Error).message);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
