// ═══════════════════════════════════════════════════════════
// Google Calendar Integration
// ═══════════════════════════════════════════════════════════
// OAuth 2.0 + Calendar API helpers used by:
//   - /api/integrations/google-calendar/auth      (start OAuth)
//   - /api/integrations/google-calendar/callback  (exchange code)
//   - /api/dashboard/google-calendar/slots        (read free slots)
//   - Flow engine book_appointment node           (create event)
// Tokens are stored encrypted in tenant_integrations.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptToken, decryptToken } from '@/lib/utils/crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

function clientId()     { return process.env.GOOGLE_CLIENT_ID!; }
function clientSecret() { return process.env.GOOGLE_CLIENT_SECRET!; }
function redirectUri()  { return `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback`; }

// ── Build the OAuth URL to redirect the tenant to ──────────
export function getGoogleAuthUrl(tenantId: string): string {
  const params = new URLSearchParams({
    client_id:     clientId(),
    redirect_uri:  redirectUri(),
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state:         tenantId, // passed back in callback so we know which tenant
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Exchange auth code for tokens + persist ────────────────
export async function exchangeCodeAndStore(code: string, tenantId: string): Promise<void> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId(),
      client_secret: clientSecret(),
      redirect_uri:  redirectUri(),
      grant_type:    'authorization_code',
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

  const tokens = await res.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
    token_type:    string;
  };

  const config = {
    access_token:  encryptToken(tokens.access_token),
    refresh_token: encryptToken(tokens.refresh_token),
    expires_at:    Date.now() + tokens.expires_in * 1000,
  };

  await supabaseAdmin
    .from('tenant_integrations')
    .upsert(
      { tenant_id: tenantId, integration_id: 'google_calendar', config, is_active: true },
      { onConflict: 'tenant_id,integration_id' }
    );
}

// ── Load + auto-refresh token ──────────────────────────────
async function getAccessToken(tenantId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'google_calendar')
    .single();

  if (error || !data) throw new Error('Google Calendar not connected for this tenant');

  const cfg = data.config as { access_token: string; refresh_token: string; expires_at: number };

  if (Date.now() < cfg.expires_at - 60_000) {
    return decryptToken(cfg.access_token) as string;
  }

  // Token expired — refresh
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId(),
      client_secret: clientSecret(),
      refresh_token: decryptToken(cfg.refresh_token) as string,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

  const refreshed = await res.json() as { access_token: string; expires_in: number };

  const newCfg = {
    ...cfg,
    access_token: encryptToken(refreshed.access_token),
    expires_at:   Date.now() + refreshed.expires_in * 1000,
  };

  await supabaseAdmin
    .from('tenant_integrations')
    .update({ config: newCfg })
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'google_calendar');

  return refreshed.access_token;
}

// ── Read available 30-min slots from primary calendar ─────
export interface CalendarSlot {
  start: string; // ISO 8601
  end:   string;
}

export async function getAvailableSlots(
  tenantId: string,
  dateISO: string,       // e.g. "2026-05-20"
  durationMinutes = 30,
  workdayStart = 9,       // hour (24h)
  workdayEnd   = 18,
): Promise<CalendarSlot[]> {
  const token    = await getAccessToken(tenantId);
  const dayStart = new Date(`${dateISO}T${String(workdayStart).padStart(2, '0')}:00:00`);
  const dayEnd   = new Date(`${dateISO}T${String(workdayEnd).padStart(2, '0')}:00:00`);

  // Get busy slots from Google's freebusy API
  const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items:   [{ id: 'primary' }],
    }),
  });

  if (!freeBusyRes.ok) throw new Error(`FreeBusy failed: ${await freeBusyRes.text()}`);

  const freeBusy = await freeBusyRes.json() as {
    calendars: { primary: { busy: { start: string; end: string }[] } };
  };

  const busy = freeBusy.calendars?.primary?.busy ?? [];

  // Build candidate slots every durationMinutes
  const slots: CalendarSlot[] = [];
  const step = durationMinutes * 60_000;
  let cursor = dayStart.getTime();

  while (cursor + step <= dayEnd.getTime()) {
    const slotStart = cursor;
    const slotEnd   = cursor + step;

    const isBlocked = busy.some(b => {
      const bStart = new Date(b.start).getTime();
      const bEnd   = new Date(b.end).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });

    if (!isBlocked) {
      slots.push({
        start: new Date(slotStart).toISOString(),
        end:   new Date(slotEnd).toISOString(),
      });
    }

    cursor += step;
  }

  return slots;
}

// ── Create a booking event ─────────────────────────────────
export interface BookingDetails {
  title:       string;
  start:       string; // ISO 8601
  end:         string;
  description?: string;
  guestEmail?:  string;
  guestName?:   string;
}

export async function createBookingEvent(tenantId: string, booking: BookingDetails): Promise<string> {
  const token = await getAccessToken(tenantId);

  const event: Record<string, unknown> = {
    summary:     booking.title,
    description: booking.description ?? '',
    start:       { dateTime: booking.start, timeZone: 'Asia/Kolkata' },
    end:         { dateTime: booking.end,   timeZone: 'Asia/Kolkata' },
  };

  if (booking.guestEmail) {
    event.attendees = [{ email: booking.guestEmail, displayName: booking.guestName ?? '' }];
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) throw new Error(`Create event failed: ${await res.text()}`);

  const created = await res.json() as { id: string; htmlLink: string };
  return created.htmlLink ?? created.id;
}
