import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { appendBookingRow } from '@/lib/integrations/google-sheets';
import { createBookingPaymentLink, fireIntegrations } from '@/lib/integrations/runner';
import { sendTextMessage, sendStaffAlert } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatSlotTime(slotTime: string): string {
  const [h, m] = slotTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr12}:${String(m).padStart(2, '0')} ${ampm}`;
}

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
      .select('short_code, business_name, booking_fee_per_person, wa_access_token, wa_phone_number_id, staff_phone, manager_phone')
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

    // 5a. Resolve the best-matching slot and enforce capacity BEFORE charging anyone.
    const { data: allSlots } = await supabaseAdmin
      .from('restaurant_slots')
      .select('id, slot_time, total_capacity')
      .eq('restaurant_id', tenantId)
      .eq('is_active', true)
      .order('slot_time', { ascending: true });

    let chosenSlot: { id: string; slot_time: string } | null = null;

    if (allSlots && allSlots.length > 0) {
      const reqMins = timeToMins(slotTime);
      chosenSlot = allSlots.reduce((best, s) =>
        Math.abs(timeToMins(s.slot_time) - reqMins) < Math.abs(timeToMins(best.slot_time) - reqMins) ? s : best
      );
    } else {
      // No slots configured — create a sensible default so the booking can land.
      const { data: newSlot } = await supabaseAdmin
        .from('restaurant_slots')
        .insert({ restaurant_id: tenantId, slot_time: slotTime || '19:30:00', day_type: 'both', total_capacity: 50, is_active: true })
        .select('id, slot_time')
        .single();
      if (newSlot) chosenSlot = newSlot;
    }

    if (!chosenSlot) {
      return NextResponse.json({ success: false, error: 'No active slots configured for this restaurant.' }, { status: 422 });
    }

    // 5b. Availability gate — fail fast before creating a payment link or writing anything.
    const { data: availData, error: availErr } = await supabaseAdmin.rpc('check_seat_availability', {
      p_slot_id:      chosenSlot.id,
      p_booking_date: bookingDate,
      p_party_size:   guestCount,
    });

    if (availErr) {
      console.error('❌ [SAVE BOOKING] availability RPC error:', availErr.message);
      return NextResponse.json({ success: false, error: 'Could not verify availability. Please try again.' }, { status: 503 });
    }

    const avail = availData as { available: boolean; remaining_seats: number; error?: string } | null;

    if (!avail?.available) {
      // Find alternative slots with capacity for the same date.
      const otherSlots = (allSlots || []).filter(s => s.id !== chosenSlot!.id);
      const altResults = await Promise.all(
        otherSlots.map(async s => {
          const { data: a } = await supabaseAdmin.rpc('check_seat_availability', {
            p_slot_id: s.id, p_booking_date: bookingDate, p_party_size: guestCount,
          });
          return { slot: s, available: (a as { available: boolean } | null)?.available ?? false };
        })
      );
      const alternatives = altResults.filter(r => r.available).map(r => formatSlotTime(r.slot.slot_time));

      console.warn(`⚠️ [SAVE BOOKING] Slot full: ${avail?.remaining_seats ?? 0} seats left, need ${guestCount}`);
      return NextResponse.json({
        success: false,
        error: 'slot_full',
        remaining_seats: avail?.remaining_seats ?? 0,
        alternatives,
        message: alternatives.length > 0
          ? `That slot is fully booked. Available times on ${bookingDate}: ${alternatives.slice(0, 3).join(', ')}.`
          : `Sorry, we are fully booked for ${bookingDate}. Please try another date.`,
      }, { status: 409 });
    }

    console.log(`   ✅ Capacity OK — ${avail.remaining_seats} seats remaining after this booking.`);

    // 5c. Booking commitment fee — only created after we know the slot has room.
    const feePerPerson = Number((tenant as any).booking_fee_per_person) || 0;
    const feeRupees = feePerPerson > 0 ? feePerPerson * guestCount : 0;
    let paymentLink: { id: string; short_url: string } | null = null;
    if (feeRupees > 0) {
      paymentLink = await createBookingPaymentLink(
        tenantId,
        { name, phone: cleanPhoneStr },
        feeRupees,
        `Booking fee for ${guestCount} guest(s) at ${tenant.business_name} — ${reservationId}`,
        reservationId
      );
    }
    const isPrepaid = !!paymentLink;
    const payStatus: 'pending' | 'paid' = isPrepaid ? 'pending' : 'paid';

    const bookingPayload = {
      reservation_id: reservationId,
      customer_name: name,
      customer_phone: cleanPhoneStr,
      party_size: guestCount,
      slot_time: chosenSlot.slot_time,
      booking_date: bookingDate,
      booking_status: 'confirmed',
      payment_status: payStatus,
      payment_amount: isPrepaid ? Math.round(feeRupees * 100) : 0, // paise — Sheets renders as ₹
      created_at: new Date().toISOString(),
      special_request,
    };

    console.log(`🚀 [SAVE BOOKING] Saving reservation ${reservationId} for tenant ${tenant.business_name}...`);

    // 6. Direct Append to Google Sheets
    await appendBookingRow(tenantId, bookingPayload);

    // 7. Insert into Supabase restaurant_bookings so it registers in the manager dashboard.
    try {
      await supabaseAdmin.from('restaurant_bookings').insert({
        restaurant_id: tenantId,
        slot_id:       chosenSlot.id,
        booking_date:  bookingDate,
        customer_name: name,
        customer_phone: cleanPhoneStr,
        party_size:    guestCount,
        payment_amount: isPrepaid ? Math.round(feeRupees * 100) : 0, // paise
        payment_status: payStatus,
        booking_status: 'confirmed',
        reservation_id: reservationId,
        ...(paymentLink && { payment_link_url: paymentLink.short_url, payment_link_id: paymentLink.id }),
      });
      console.log(`   ✓ Saved to restaurant_bookings (slot ${chosenSlot.slot_time}).`);

      // Auto-create guest profile so WhatsApp guests appear in the Guests CRM.
      await supabaseAdmin
        .from('restaurant_guests')
        .upsert(
          { restaurant_id: tenantId, customer_phone: cleanPhoneStr, customer_name: name },
          { onConflict: 'restaurant_id,customer_phone', ignoreDuplicates: true }
        );
    } catch (dbErr: any) {
      console.warn('⚠️ [SAVE BOOKING] Supabase insertion warning (non-blocking):', dbErr.message);
    }

    // 8. Send WhatsApp messages + fire integrations.
    const accessToken = (tenant as any).wa_access_token ? (decryptToken((tenant as any).wa_access_token) as string) : '';
    const phoneNumberId = (tenant as any).wa_phone_number_id as string;

    if (paymentLink) {
      if (accessToken && phoneNumberId) {
        const payMsg = `Almost done! 🎉\nTo confirm your table for ${guestCount} on ${bookingDate}, please pay the ₹${feeRupees} booking fee here:\n${paymentLink.short_url}\n\nReservation: ${reservationId}`;
        sendTextMessage(accessToken, phoneNumberId, cleanPhoneStr, payMsg).catch(e =>
          console.error('Failed to send payment link:', (e as Error).message));
      }
      fireIntegrations({
        type: 'payment_requested',
        tenantId,
        lead: { name, phone: cleanPhoneStr },
        amount: feeRupees,
        description: `Booking ${reservationId}`,
      }).catch(() => {});
    } else {
      fireIntegrations({
        type: 'booking_confirmed',
        tenantId,
        lead: { name, phone: cleanPhoneStr },
        details: {
          reservation_id: reservationId,
          party_size: String(guestCount),
          date: bookingDate,
          time: slotTime,
        },
      }).catch(() => {});
    }

    // Always notify staff + manager immediately (both recipients, independent sends).
    console.log(`[save-booking] Loaded settings — staff_phone=${(tenant as any).staff_phone ?? 'null'}, manager_phone=${(tenant as any).manager_phone ?? 'null'}`);
    if (accessToken && phoneNumberId) {
      const displayTime = formatSlotTime(chosenSlot!.slot_time);
      const paymentNote = isPrepaid ? `\n💳 Payment: ₹${feeRupees} pending` : '';
      const alertMsg =
        `🔔 New Booking!\n\n` +
        `👤 ${name}, ${guestCount} guest${guestCount !== 1 ? 's' : ''}\n` +
        `⏰ ${displayTime} on ${bookingDate}\n` +
        `📋 Reservation ID: ${reservationId}\n` +
        `📞 Phone: ${cleanPhoneStr}` +
        paymentNote +
        (special_request ? `\n📝 Note: ${special_request}` : '');
      sendStaffAlert(
        {
          wa_phone_number_id: phoneNumberId,
          wa_access_token: (tenant as any).wa_access_token as string,
          staff_phone:   (tenant as any).staff_phone   as string | null,
          manager_phone: (tenant as any).manager_phone as string | null,
        },
        alertMsg
      ).then(results =>
        console.log(`[save-booking] Booking alert sent to ${results.filter(r => r.ok).length}/${results.length} recipients:`, results.map(r => `${r.phone}=${r.ok ? 'ok' : r.error}`))
      ).catch(e => console.error('❌ [SAVE BOOKING] Staff notification failed:', (e as Error).message));
    }

    return NextResponse.json({
      success: true,
      reservationId,
      payment_required: isPrepaid,
      payment_link: paymentLink?.short_url || null,
      fee: feeRupees,
      message: isPrepaid
        ? `Booking created. ₹${feeRupees} payment link sent to the guest on WhatsApp.`
        : 'Booking successfully created and synced to Google Sheets!'
    });

  } catch (err: any) {
    console.error('❌ [SAVE BOOKING] Route Error:', err.message);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
