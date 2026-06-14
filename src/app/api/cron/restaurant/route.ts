import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export const maxDuration = 10;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [remindersSent, reviewsSent] = await Promise.all([
    processTableReminders(),
    processReviewRequests(),
  ]);

  return NextResponse.json({ success: true, remindersSent, reviewsSent });
}

async function processTableReminders(): Promise<number> {
  const now = new Date();
  const todayDate = now.toISOString().split('T')[0];

  // Current time in HH:MM format (server time — assumes IST or tenant-local)
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentMins = currentHour * 60 + currentMin;

  // Find confirmed bookings for today that haven't had a reminder sent
  const { data: bookings, error } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('id, customer_name, customer_phone, party_size, reservation_id, restaurant_id, special_request, restaurant_slots(slot_time)')
    .eq('booking_date', todayDate)
    .eq('booking_status', 'confirmed')
    .is('reminder_sent_at', null);

  if (error) {
    console.error('❌ Reminder query failed:', error.message);
    return 0;
  }
  if (!bookings || bookings.length === 0) {
    return 0;
  }

  let sent = 0;

  for (const booking of bookings) {
    const slotTime = (booking as any).restaurant_slots?.slot_time;
    if (!slotTime) continue;

    // Parse slot time (HH:MM:SS)
    const [slotH, slotM] = slotTime.split(':').map(Number);
    const slotMins = slotH * 60 + slotM;

    // Send reminder between 55-65 minutes before slot time
    const minsUntilSlot = slotMins - currentMins;
    if (minsUntilSlot < 55 || minsUntilSlot > 65) continue;

    // Fetch tenant credentials
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id, business_name')
      .eq('id', booking.restaurant_id)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) continue;

    try {
      const token = decryptToken(tenant.wa_access_token!);
      if (!token) continue;
      const timeDisplay = formatTimeDisplay(slotTime);
      const bizName = tenant.business_name || 'the restaurant';

      const message = `Hi ${booking.customer_name}! 🍽️\n\nFriendly reminder — your table for ${booking.party_size} guest${booking.party_size !== 1 ? 's' : ''} at ${bizName} is in 1 hour (${timeDisplay}).\n\nReservation: ${booking.reservation_id}\n\nWe look forward to seeing you! 🙏`;

      await sendTextMessage(
        token,
        tenant.wa_phone_number_id,
        booking.customer_phone,
        message
      );

      // Mark reminder as sent
      await supabaseAdmin
        .from('restaurant_bookings')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', booking.id);

      sent++;
      console.log(`📩 Reminder sent to ${booking.customer_name} (${booking.customer_phone}) for ${timeDisplay}`);
    } catch (err: any) {
      console.error(`❌ Failed to send reminder for booking ${booking.reservation_id}:`, err.message);
    }
  }

  return sent;
}

function formatTimeDisplay(slotTime: string): string {
  const [h, m] = slotTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function processReviewRequests(): Promise<number> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  // Send ~30 min after the table was freed. Window is 28–35 min ago: with the
  // cron firing every 5 min, exactly one tick lands in this 7-min window per
  // table, so each guest is messaged once, never early, at most ~5 min late.
  const minAgo = new Date(now.getTime() - 35 * 60_000).toISOString();
  const maxAgo = new Date(now.getTime() - 28 * 60_000).toISOString();

  const { data: tables, error } = await supabaseAdmin
    .from('restaurant_tables')
    .select('id, name, restaurant_id, last_guest_phone, last_guest_name, freed_at')
    .not('freed_at', 'is', null)
    .not('last_guest_phone', 'is', null)
    .is('review_request_sent_at', null)
    .gte('freed_at', minAgo)
    .lte('freed_at', maxAgo);

  if (error) {
    console.error('❌ Review pump query failed:', error.message);
    return 0;
  }
  if (!tables || tables.length === 0) {
    return 0;
  }

  const tenantIds = [...new Set(tables.map((t) => t.restaurant_id))];
  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, wa_access_token, wa_phone_number_id, business_name, google_review_url')
    .in('id', tenantIds);

  if (!tenants || tenants.length === 0) return 0;

  const tenantMap = new Map(tenants.map((t) => [t.id, t]));
  let sent = 0;

  for (const table of tables) {
    const tenant = tenantMap.get(table.restaurant_id);
    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) continue;
    if (!tenant.google_review_url) continue;

    const token = decryptToken(tenant.wa_access_token);
    if (!token) continue;

    // Don't message the same customer twice in one day (e.g. two visits).
    const { data: alreadySent } = await supabaseAdmin
      .from('restaurant_review_requests')
      .select('id')
      .eq('restaurant_id', table.restaurant_id)
      .eq('customer_phone', table.last_guest_phone!)
      .eq('sent_on', todayStr)
      .maybeSingle();

    if (alreadySent) {
      // Clear the flag so this freed table stops re-qualifying on every run.
      await supabaseAdmin
        .from('restaurant_tables')
        .update({ review_request_sent_at: now.toISOString() })
        .eq('id', table.id);
      continue;
    }

    const bizName = tenant.business_name || 'our restaurant';
    const guestName = table.last_guest_name || 'there';

    const message =
      `Hi ${guestName}! 😊\n\n` +
      `Thank you for dining at ${bizName}! We hope you had a wonderful experience.\n\n` +
      `We'd love your feedback — a quick Google review means the world to us:\n` +
      `${tenant.google_review_url}\n\n` +
      `Thank you! 🙏`;

    try {
      await sendTextMessage(
        token,
        tenant.wa_phone_number_id,
        table.last_guest_phone!,
        message
      );

      await Promise.all([
        supabaseAdmin
          .from('restaurant_tables')
          .update({ review_request_sent_at: now.toISOString() })
          .eq('id', table.id),
        supabaseAdmin
          .from('restaurant_review_requests')
          .upsert(
            {
              restaurant_id: table.restaurant_id,
              customer_phone: table.last_guest_phone!,
              customer_name: table.last_guest_name,
              table_name: table.name,
            },
            { onConflict: 'restaurant_id,customer_phone,sent_on', ignoreDuplicates: true }
          ),
      ]);

      sent++;
      console.log(`⭐ Review request sent to ${guestName} (${table.last_guest_phone}) — ${table.name}`);
    } catch (err: any) {
      console.error(`❌ Failed to send review request for ${table.name}:`, err.message);
    }
  }

  return sent;
}
