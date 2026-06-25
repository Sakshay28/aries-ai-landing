import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface BookingAlertEmailParams {
  staffEmail: string;
  businessName: string;
  customerName: string;
  customerPhone: string;
  guestCount: string;
  date: string;
  time: string;
  tableName?: string | null;
  specialRequests?: string | null;
  reservationId: string;
}

export async function sendBookingAlertEmail(params: BookingAlertEmailParams): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn('[bookingEmail] RESEND_API_KEY not set — email alert skipped');
    return;
  }

  const {
    staffEmail, businessName, customerName, customerPhone,
    guestCount, date, time, tableName, specialRequests, reservationId,
  } = params;

  const tableRow = tableName
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Table</td><td style="padding:6px 0;font-size:14px;font-weight:600">🪑 ${esc(tableName)}</td></tr>`
    : '';
  const specialRow = specialRequests
    ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Special Requests</td><td style="padding:6px 0;font-size:14px">📝 ${esc(specialRequests)}</td></tr>`
    : '';

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:24px 28px">
    <p style="margin:0;color:#a78bfa;font-size:12px;letter-spacing:1px;text-transform:uppercase">New Booking</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:22px">🔔 ${esc(businessName)}</h1>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Customer</td><td style="padding:6px 0;font-size:14px;font-weight:600">👤 ${esc(customerName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Phone</td><td style="padding:6px 0;font-size:14px">📞 ${esc(customerPhone)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Guests</td><td style="padding:6px 0;font-size:14px">👥 ${esc(guestCount)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Date</td><td style="padding:6px 0;font-size:14px">📅 ${esc(date)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Time</td><td style="padding:6px 0;font-size:14px">⏰ ${esc(time)}</td></tr>
      ${tableRow}
      ${specialRow}
      <tr><td colspan="2" style="padding-top:12px;border-top:1px solid #f3f4f6"></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Reservation ID</td><td style="padding:6px 0;font-size:13px;font-family:monospace;color:#4f46e5">${esc(reservationId)}</td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">Sent by Aries AI · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
  </div>
</div>`;

  try {
    await resend.emails.send({
      from: 'Aries AI Bookings <alerts@ariesai.in>',
      to: staffEmail,
      subject: `🔔 New Booking — ${customerName} for ${guestCount} on ${date}`,
      html,
    });
    console.log(`✅ Booking alert email sent → ${staffEmail}`);
  } catch (err) {
    console.error(`❌ Booking alert email failed → ${staffEmail}:`, (err as Error).message);
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
