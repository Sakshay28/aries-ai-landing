// ═══════════════════════════════════════════════════════════
// 🔌 Integration Runner
// Fires active integrations on business events:
//   new_lead, booking_confirmed, payment_requested
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

export type IntegrationEvent =
  | { type: 'new_lead'; tenantId: string; lead: { name: string; phone: string; email?: string; lead_status?: string; source?: string } }
  | { type: 'booking_confirmed'; tenantId: string; lead: { name: string; phone: string }; details: Record<string, string> }
  | { type: 'payment_requested'; tenantId: string; lead: { name: string; phone: string }; amount: number; description: string };

type IntegrationConfig = Record<string, string>;

function decrypt(v: string): string {
  if (!v) return '';
  try { return (decryptToken(v) as string) || v; } catch { return v; }
}

// ── Razorpay: generate payment link ─────────────────────────
async function runRazorpay(cfg: IntegrationConfig, event: IntegrationEvent) {
  if (event.type !== 'payment_requested') return;
  const keyId = decrypt(cfg.key_id || cfg.key_id);
  const keySecret = decrypt(cfg.key_secret);
  if (!keyId || !keySecret) return;

  try {
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: event.amount * 100,
        currency: 'INR',
        description: event.description,
        customer: { name: event.lead.name, contact: event.lead.phone },
        notify: { sms: false, email: false },
        reminder_enable: true,
      }),
    });
    const data = await res.json();
    console.log(`💳 Razorpay payment link created: ${data.short_url}`);
    return data.short_url as string;
  } catch (e) {
    console.error('Razorpay integration error:', (e as Error).message);
  }
}

// ── Zoho CRM: create lead ────────────────────────────────────
async function runZohoCRM(cfg: IntegrationConfig, event: IntegrationEvent) {
  if (event.type !== 'new_lead') return;
  const token = decrypt(cfg.access_token);
  const domain = cfg.domain || 'com';
  if (!token) return;

  try {
    const res = await fetch(`https://www.zohoapis.${domain}/crm/v2/Leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Zoho-oauthtoken ${token}`,
      },
      body: JSON.stringify({
        data: [{
          Last_Name: event.lead.name || 'Unknown',
          Mobile: event.lead.phone,
          Email: event.lead.email || '',
          Lead_Source: 'WhatsApp',
          Description: `Captured via Aries AI on ${new Date().toLocaleDateString()}`,
        }],
      }),
    });
    const data = await res.json();
    console.log(`🏢 Zoho CRM: lead synced — ${data?.data?.[0]?.details?.id}`);
  } catch (e) {
    console.error('Zoho CRM integration error:', (e as Error).message);
  }
}

// ── Shiprocket: get auth token then fetch tracking ───────────
async function runShiprocket(cfg: IntegrationConfig, event: IntegrationEvent) {
  // Shiprocket fires on booking events with order/AWB info
  if (event.type !== 'booking_confirmed') return;
  const email = cfg.email;
  const password = decrypt(cfg.password);
  if (!email || !password) return;

  try {
    const authRes = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const { token } = await authRes.json();
    if (!token) return;
    console.log(`🚚 Shiprocket: authenticated for booking event`);
    // Future: create shipment, get tracking URL, send via WhatsApp
    // const trackingUrl = `https://shiprocket.co/tracking/${awb}`;
  } catch (e) {
    console.error('Shiprocket integration error:', (e as Error).message);
  }
}

// ── Pabbly Connect: POST to Pabbly webhook URL ───────────────
async function runPabbly(cfg: IntegrationConfig, event: IntegrationEvent) {
  const url = cfg.webhook_url;
  if (!url) return;

  const enabledEvents = (cfg.events || 'new_lead,booking_confirmed,payment_requested').split(',');
  if (!enabledEvents.includes(event.type)) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: event.type, timestamp: new Date().toISOString(), ...event }),
    });
    console.log(`⚡ Pabbly Connect: ${event.type} sent → ${url}`);
  } catch (e) {
    console.error('Pabbly integration error:', (e as Error).message);
  }
}

// ── Custom Webhooks: generic event POST ─────────────────────
async function runCustomWebhooks(cfg: IntegrationConfig, event: IntegrationEvent) {
  const url = cfg.webhook_url;
  if (!url) return;

  const enabledEvents = (cfg.events || 'new_lead,booking_confirmed,payment_requested').split(',');
  if (!enabledEvents.includes(event.type)) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: event.type, timestamp: new Date().toISOString(), ...event }),
    });
    console.log(`🪝 Custom webhook fired: ${event.type} → ${url}`);
  } catch (e) {
    console.error('Custom webhook error:', (e as Error).message);
  }
}

// ── Google Calendar: POST booking to the configured Zapier/Make webhook ──
// The Integrations UI sets up a Zapier/Make scenario (Webhook → Calendar event)
// and stores its trigger URL. We forward booking_confirmed events to it.
async function runGoogleCalendar(cfg: IntegrationConfig, event: IntegrationEvent) {
  if (event.type !== 'booking_confirmed') return;
  const url = cfg.webhook_url;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: event.type,
        timestamp: new Date().toISOString(),
        calendar_id: cfg.calendar_id || '',
        timezone: cfg.timezone || 'Asia/Kolkata',
        ...event,
      }),
    });
    console.log(`📅 Google Calendar (webhook): booking sent → ${url}`);
  } catch (e) {
    console.error('Google Calendar integration error:', (e as Error).message);
  }
}

// ── Main runner ──────────────────────────────────────────────
const HANDLERS: Record<string, (cfg: IntegrationConfig, event: IntegrationEvent) => Promise<string | void | undefined>> = {
  razorpay: runRazorpay,
  zohocrm: runZohoCRM,
  shiprocket: runShiprocket,
  pabbly: runPabbly,
  webhooks: runCustomWebhooks,
  googlecalendar: runGoogleCalendar,
};

export async function fireIntegrations(event: IntegrationEvent): Promise<void> {
  try {
    const { data: integrations } = await supabaseAdmin
      .from('tenant_integrations')
      .select('integration_id, config')
      .eq('tenant_id', event.tenantId)
      .eq('is_active', true);

    if (!integrations || integrations.length === 0) return;

    await Promise.allSettled(
      integrations.map(row => {
        const handler = HANDLERS[row.integration_id];
        return handler
          ? handler(row.config as IntegrationConfig, event)
          : Promise.resolve();
      })
    );
  } catch (e) {
    console.error('Integration runner error:', (e as Error).message);
  }
}

// ── Razorpay payment link (called directly from AI engine) ──
export async function generateRazorpayLink(
  tenantId: string,
  lead: { name: string; phone: string },
  amount: number,
  description: string
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'razorpay')
    .eq('is_active', true)
    .single();

  if (!data?.config) return null;
  const result = await runRazorpay(data.config as IntegrationConfig, {
    type: 'payment_requested',
    tenantId,
    lead,
    amount,
    description,
  });
  return result ?? null;
}

// ── Booking commitment fee: Razorpay payment link tied to a reservation ──
// Returns { id, short_url } so the caller can send the link over WhatsApp and
// the Razorpay webhook can match the `payment_link.paid` event back to the booking.
export async function createBookingPaymentLink(
  tenantId: string,
  lead: { name: string; phone: string },
  amountRupees: number,
  description: string,
  referenceId: string
): Promise<{ id: string; short_url: string } | null> {
  const { data } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'razorpay')
    .eq('is_active', true)
    .single();
  if (!data?.config) return null;

  const cfg = data.config as IntegrationConfig;
  const keyId = decrypt(cfg.key_id);
  const keySecret = decrypt(cfg.key_secret);
  if (!keyId || !keySecret) return null;

  try {
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: Math.round(amountRupees * 100),
        currency: 'INR',
        description,
        reference_id: referenceId,
        customer: { name: lead.name || 'Guest', contact: lead.phone },
        notify: { sms: false, email: false },
        reminder_enable: true,
        notes: { tenant_id: tenantId, reservation_id: referenceId, type: 'booking' },
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      console.error('Razorpay booking link error:', JSON.stringify(j).slice(0, 300));
      return null;
    }
    return { id: j.id as string, short_url: j.short_url as string };
  } catch (e) {
    console.error('Razorpay booking link exception:', (e as Error).message);
    return null;
  }
}
