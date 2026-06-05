// ═══════════════════════════════════════════════════════════
// ⭐ Post-Visit Review Request Automation
// Runs daily. Finds yesterday's confirmed bookings and sends a
// WhatsApp review request. 5-star path → Google review link.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Yesterday's date (IST)
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const yesterday = new Date(nowIST.getTime() - 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  // Find confirmed bookings from yesterday that haven't had a review request sent
  const { data: bookings } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('id, restaurant_id, customer_name, customer_phone, party_size')
    .eq('booking_date', yesterday)
    .eq('booking_status', 'confirmed')
    .eq('review_request_sent', false);

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Group bookings by tenant so we load credentials once per tenant
  const byTenant = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const arr = byTenant.get(b.restaurant_id) || [];
    arr.push(b);
    byTenant.set(b.restaurant_id, arr);
  }

  let sent = 0;

  for (const [tenantId, tenantBookings] of byTenant) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name, wa_access_token, wa_phone_number_id, google_review_url, review_automation_enabled')
      .eq('id', tenantId)
      .single();

    if (!tenant || tenant.review_automation_enabled === false) continue;
    if (!tenant.wa_access_token || !tenant.wa_phone_number_id) continue;

    const token = decryptToken(tenant.wa_access_token as string);
    if (!token) continue;
    const phoneId = tenant.wa_phone_number_id as string;
    const bizName = (tenant.business_name as string) || 'us';

    for (const b of tenantBookings) {
      const firstName = (b.customer_name || 'there').split(' ')[0];
      const reviewLink = tenant.google_review_url
        ? `\n\nLoved your experience? A quick review means the world to us: ${tenant.google_review_url}`
        : '';
      const msg = `Hi ${firstName}! 🙏 Thanks for visiting ${bizName} yesterday. How was your experience? Reply 1-5 (5 = amazing).${reviewLink}`;

      try {
        await sendTextMessage(token, phoneId, b.customer_phone, msg);
        await supabaseAdmin
          .from('restaurant_bookings')
          .update({ review_request_sent: true, review_request_sent_at: new Date().toISOString() })
          .eq('id', b.id);
        // Log as outbound message if a conversation exists
        const cleanPhone = b.customer_phone.replace(/\D/g, '');
        const { data: conv } = await supabaseAdmin
          .from('conversations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('sender_id', cleanPhone)
          .eq('is_active', true)
          .maybeSingle();
        if (conv) {
          await supabaseAdmin.from('messages').insert({
            tenant_id: tenantId, conversation_id: conv.id,
            direction: 'outbound', content: msg,
            message_type: 'text', channel: 'whatsapp',
            status: 'sent', ai_generated: false,
          });
        }
        sent++;
      } catch (e) {
        console.error(`⭐ Review request failed for booking ${b.id}:`, (e as Error).message);
      }
    }
  }

  console.log(`⭐ [review-requests] sent=${sent}`);
  return NextResponse.json({ ok: true, sent });
}
