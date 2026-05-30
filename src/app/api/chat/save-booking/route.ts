import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { appendBookingRow } from '@/lib/integrations/google-sheets';

// ── Parse a free-form datetime string from an intake form ────────────────────
// Handles inputs like:
//   "Tomorrow 8 PM", "31 May 7:30 PM", "2026-05-31 20:00", "31st May 2026 8pm"
// Returns { bookingDate: 'YYYY-MM-DD', slotTime: 'HH:MM:00' }
function parseDatetime(raw: string): { bookingDate: string; slotTime: string } {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + (5.5 * 60 * 60 * 1000)); // IST offset

  let bookingDate = istTime.toISOString().slice(0, 10);
  let slotTime = '19:30:00';

  try {
    const s = raw.trim().toLowerCase();

    // Construct baseDate as a pure UTC date representing the IST day
    const baseDate = new Date(Date.UTC(
      istTime.getFullYear(),
      istTime.getMonth(),
      istTime.getDate()
    ));

    if (s.includes('tomorrow')) {
      baseDate.setUTCDate(baseDate.getUTCDate() + 1);
    } else if (s.includes('day after')) {
      baseDate.setUTCDate(baseDate.getUTCDate() + 2);
    } else if (s.includes('today')) {
      // keep baseDate as today
    } else {
      // Try to find DD MMM / MMM DD / YYYY-MM-DD patterns
      const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        baseDate.setUTCFullYear(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      } else {
        const months: Record<string, number> = {
          jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
          january:0, february:1, march:2, april:3, june:5, july:6, august:7,
          september:8, october:9, november:10, december:11,
        };
        const monthKeys = Object.keys(months).sort((a,b) => b.length - a.length).join('|');
        const dayMonthMatch = raw.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthKeys})`, 'i'));
        const monDayMatch  = raw.match(new RegExp(`(${monthKeys})\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
        const matched = dayMonthMatch || monDayMatch;
        if (matched) {
          const [, a, b] = matched;
          const day = parseInt(dayMonthMatch ? a : b);
          const mon = months[(dayMonthMatch ? b : a).toLowerCase()];
          if (!isNaN(day) && mon !== undefined) {
            baseDate.setUTCFullYear(istTime.getFullYear(), mon, day);
            const todayStr = istTime.toISOString().slice(0, 10);
            if (baseDate.toISOString().slice(0, 10) < todayStr) {
              baseDate.setUTCFullYear(istTime.getFullYear() + 1);
            }
          }
        }
      }
    }
    bookingDate = baseDate.toISOString().slice(0, 10);

    // Time parsing
    const timeMatch = raw.match(/(\d{1,2})[:\.]?(\d{2})?\s*(am|pm)/i)
                   || raw.match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2] || '0');
      const meridiem = (timeMatch[3] || '').toLowerCase();
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      slotTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  } catch {
    // keep defaults
  }

  return { bookingDate, slotTime };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Resolve Tenant ID from server-sent X-Aries-Tenant header
    const tenantId = req.headers.get('x-aries-tenant');
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing X-Aries-Tenant header' }, { status: 401 });
    }

    // 2. Parse request payload
    const body = await req.json().catch(() => ({}));
    // The intake form saves date and time as SEPARATE fields: booking_date + booking_time
    // Accept all variants: separate fields, combined booking_datetime, or legacy datetime
    const { phone, name, party_size, special_request = '' } = body;
    const datetime: string =
      // Separate date + time (current intake form format)
      (body.booking_date && body.booking_time)
        ? `${body.booking_date} ${body.booking_time}`
        // Combined single field
        : body.booking_datetime || body.datetime || '';

    if (!phone || !name || !party_size) {
      return NextResponse.json({ success: false, error: 'Missing phone, name, or party_size in payload' }, { status: 400 });
    }

    // 3. Fetch Tenant details for Short Code generating Reservation ID
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('short_code, business_name')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 4. Generate Reservation ID
    const shortCode = tenant.short_code || 'RES';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = Math.floor(Math.random() * 9000) + 1000; // Unique sequence number
    const reservationId = `${shortCode}-${dateStr}-${seq}`;

    // 5. Build Booking Row for Google Sheets Sync
    const cleanPhoneStr = phone.replace(/\D/g, '');
    const guestCount = parseInt(String(party_size)) || 2;

    // Parse the user-typed datetime string (e.g. "Tomorrow 8 PM", "31 May 7:30 PM")
    const { bookingDate, slotTime } = parseDatetime(datetime);
    console.log(`   ↳ datetime parsed: "${datetime}" → date=${bookingDate} time=${slotTime}`);

    const bookingPayload = {
      reservation_id: reservationId,
      customer_name: name,
      customer_phone: cleanPhoneStr,
      party_size: guestCount,
      slot_time: slotTime,
      booking_date: bookingDate,
      booking_status: 'confirmed',
      payment_status: 'paid',
      payment_amount: 0, // No payment required for standard flow bookings
      created_at: new Date().toISOString(),
      special_request, // store for logging / future use
    };

    console.log(`🚀 [SAVE BOOKING] Saving reservation ${reservationId} for tenant ${tenant.business_name}...`);

    // 6. Direct Append to Google Sheets
    await appendBookingRow(tenantId, bookingPayload);

    // 7. Insert into Supabase restaurant_bookings so it registers in the manager dashboard
    try {
      // Find or create a default slot in the database first to comply with foreign key checks
      const { data: slots } = await supabaseAdmin
        .from('restaurant_slots')
        .select('id')
        .eq('restaurant_id', tenantId)
        .eq('is_active', true)
        .limit(1);

      let slotId: string | null = slots?.[0]?.id || null;

      if (!slotId) {
        // Create a default slot dynamically if none exists
        const { data: newSlot } = await supabaseAdmin
          .from('restaurant_slots')
          .insert({
            restaurant_id: tenantId,
            slot_time: '19:30:00',
            day_type: 'both',
            total_capacity: 50,
            is_active: true
          })
          .select()
          .single();
        if (newSlot) slotId = newSlot.id;
      }

      if (slotId) {
        await supabaseAdmin.from('restaurant_bookings').insert({
          restaurant_id: tenantId,
          slot_id: slotId,
          booking_date: bookingDate,
          customer_name: name,
          customer_phone: cleanPhoneStr,
          party_size: guestCount,
          payment_amount: 0,
          payment_status: 'paid',
          booking_status: 'confirmed',
          reservation_id: reservationId
        });
        console.log(`   ✓ Saved successfully to restaurant_bookings table.`);
      }
    } catch (dbErr: any) {
      console.warn('⚠️ [SAVE BOOKING] Supabase insertion warning (non-blocking):', dbErr.message);
    }

    return NextResponse.json({
      success: true,
      reservationId,
      message: 'Booking successfully created and synced to Google Sheets!'
    });

  } catch (err: any) {
    console.error('❌ [SAVE BOOKING] Route Error:', err.message);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
