// ═══════════════════════════════════════════════════════════
// Google Sheets Integration
// ═══════════════════════════════════════════════════════════
// OAuth 2.0 + Sheets API v4.
// Separate from Google Calendar — tenant can connect one or both.
// Tokens stored encrypted in tenant_integrations (integration_id: 'google_sheets').
//
// Auto-sync: each time a new lead is created, appendLeadRow() is
// called non-blocking so the lead shows up in the tenant's sheet.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptToken, decryptToken } from '@/lib/utils/crypto';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

function clientId()     { return process.env.GOOGLE_CLIENT_ID!; }
function clientSecret() { return process.env.GOOGLE_CLIENT_SECRET!; }
function redirectUri()  {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-sheets/callback`;
}

// ── Build OAuth URL ────────────────────────────────────────
export function getGoogleSheetsAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     clientId(),
    redirect_uri:  redirectUri(),
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Exchange code + store (tenant provides their Sheet URL/ID) ──
export async function exchangeAndStoreSheets(
  code:            string,
  tenantId:        string,
  spreadsheetId:   string,   // from query param state or post-auth config
): Promise<void> {
  console.log('🔍 [GSHEETS exchange] starting for tenant:', tenantId, 'spreadsheet:', spreadsheetId);

  console.log('🔍 [GSHEETS exchange] calling Google token endpoint...');
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

  if (!res.ok) {
    const errText = await res.text();
    console.error('🔍 [GSHEETS exchange] token exchange failed:', errText);
    throw new Error(`Sheets token exchange failed: ${errText}`);
  }

  const tokens = await res.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };
  console.log('🔍 [GSHEETS exchange] got tokens (has refresh_token:', !!tokens.refresh_token, ')');

  let encryptedAccess: string | null;
  let encryptedRefresh: string | null;
  try {
    encryptedAccess = encryptToken(tokens.access_token);
    encryptedRefresh = encryptToken(tokens.refresh_token);
    console.log('🔍 [GSHEETS exchange] encrypted tokens OK');
  } catch (encErr) {
    console.error('🔍 [GSHEETS exchange] encryption failed:', encErr);
    throw new Error(`Token encryption failed: ${(encErr as Error).message}`);
  }

  const config = {
    access_token:   encryptedAccess,
    refresh_token:  encryptedRefresh,
    expires_at:     Date.now() + tokens.expires_in * 1000,
    spreadsheet_id: spreadsheetId,
    sheet_name:     'Leads',
  };

  const now = new Date().toISOString();
  console.log('🔍 [GSHEETS exchange] upserting to DB...');
  const { error: upsertError } = await supabaseAdmin
    .from('tenant_integrations')
    .upsert(
      { tenant_id: tenantId, integration_id: 'google_sheets', config, is_active: true, connected_at: now, updated_at: now },
      { onConflict: 'tenant_id,integration_id' }
    );

  if (upsertError) {
    console.error('🔍 [GSHEETS exchange] DB upsert failed:', upsertError.message);
    throw new Error(`Failed to save Google Sheets config: ${upsertError.message}`);
  }

  console.log('✅ [GSHEETS exchange] SUCCESS — row saved for tenant:', tenantId);
}

// ── Load + auto-refresh token ──────────────────────────────
interface SheetsConfig {
  access_token:   string;
  refresh_token:  string;
  expires_at:     number;
  spreadsheet_id: string;
  sheet_name:     string;
}

async function getSheetsConfig(tenantId: string): Promise<{ token: string; config: SheetsConfig }> {
  const { data, error } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'google_sheets')
    .single();

  if (error || !data) throw new Error('Google Sheets not connected for this tenant');

  const cfg = data.config as SheetsConfig;

  if (Date.now() < cfg.expires_at - 60_000) {
    return { token: decryptToken(cfg.access_token) as string, config: cfg };
  }

  // Refresh
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId(),
      client_secret: clientSecret(),
      refresh_token: (decryptToken(cfg.refresh_token) ?? '') as string,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) throw new Error(`Sheets token refresh failed: ${await res.text()}`);

  const refreshed = await res.json() as { access_token: string; expires_in: number };
  const newCfg: SheetsConfig = {
    ...cfg,
    access_token: encryptToken(refreshed.access_token) ?? cfg.access_token,
    expires_at:   Date.now() + refreshed.expires_in * 1000,
  };

  await supabaseAdmin
    .from('tenant_integrations')
    .update({ config: newCfg })
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'google_sheets');

  return { token: refreshed.access_token, config: newCfg };
}

// ── Ensure sheet/tab exists dynamically ─────────────────────
async function ensureSheetExists(token: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    console.error(`🔍 [GSHEETS] failed to fetch spreadsheet metadata:`, await metaRes.text());
    return;
  }

  const meta = await metaRes.json() as { sheets?: Array<{ properties?: { title?: string } }> };
  const sheets = meta.sheets || [];
  const exists = sheets.some(s => s.properties?.title === sheetName);

  if (exists) return;

  console.log(`🔍 [GSHEETS] Sheet "${sheetName}" not found. Creating it...`);

  const createRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName
              }
            }
          }
        ]
      })
    }
  );

  if (!createRes.ok) {
    console.error(`🔍 [GSHEETS] failed to create sheet "${sheetName}":`, await createRes.text());
  } else {
    console.log(`✅ [GSHEETS] Created sheet "${sheetName}" successfully.`);
  }
}

// ── Ensure header row exists (idempotent) ──────────────────
const HEADERS = ['Name', 'Phone', 'Email'];

async function ensureHeaders(token: string, spreadsheetId: string, sheetName: string): Promise<void> {
  await ensureSheetExists(token, spreadsheetId, sheetName);

  const range = `${sheetName}!A1:C1`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return; // silently ignore — sheet might not have rows yet

  const data = await res.json() as { values?: string[][] };
  if (data.values && data.values[0]?.length > 0) return; // already has headers

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values: [HEADERS] }),
    }
  );
}

// ── Append a single lead row ───────────────────────────────
export interface LeadRow {
  name?:       string;
  phone?:      string;
  email?:      string;
  lead_status?: string;
  source?:     string;
  lead_score?: number;
  created_at?: string;
}

export async function appendLeadRow(tenantId: string, lead: LeadRow): Promise<void> {
  const { token, config } = await getSheetsConfig(tenantId);
  await ensureHeaders(token, config.spreadsheet_id, config.sheet_name);

  const range   = `${config.sheet_name}!A:C`;
  const values  = [[
    lead.name  ?? '',
    lead.phone ?? '',
    lead.email ?? '',
  ]];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values }),
    }
  );

  if (!res.ok) throw new Error(`Sheets append failed: ${await res.text()}`);
}

// ── Bulk sync: write ALL tenant leads to the sheet ─────────
export async function syncAllLeads(tenantId: string): Promise<{ synced: number }> {
  const { token, config } = await getSheetsConfig(tenantId);

  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('name, phone, email')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Leads query failed: ${error.message}`);
  if (!leads || leads.length === 0) return { synced: 0 };

  // Clear existing data and rewrite (clean sync)
  const clearRange = `${config.sheet_name}!A:C`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(clearRange)}:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  );

  const rows = [
    HEADERS,
    ...leads.map(l => [
      l.name  ?? '',
      l.phone ?? '',
      l.email ?? '',
    ]),
  ];

  const range = `${config.sheet_name}!A1`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values: rows }),
    }
  );

  if (!res.ok) throw new Error(`Sheets bulk write failed: ${await res.text()}`);
  return { synced: leads.length };
}

// ══ Booking Rows (Restaurant Manager Panel) ═════════════════════
// Appends a single booking row to the "Bookings" tab in the connected sheet.
// If Sheets is not connected for this tenant, logs a warning and returns silently.
// Non-blocking: caller should use void appendBookingRow(...) and not await.

export interface BookingRow {
  reservation_id:  string;
  customer_name:   string;
  customer_phone:  string;
  party_size:      number;
  slot_time:       string;   // e.g. '19:00:00'
  booking_date:    string;   // YYYY-MM-DD
  booking_status:  string;
  payment_status:  string;
  payment_amount:  number;   // paise
  created_at:      string;
}

const BOOKING_HEADERS = [
  'Reservation ID', 'Customer', 'Phone', 'Party Size', 'Date', 'Time', 'Status', 'Deposit (₹)', 'Special Request',
];

async function ensureBookingHeaders(
  token:         string,
  spreadsheetId: string,
  sheetName:     string
): Promise<void> {
  await ensureSheetExists(token, spreadsheetId, sheetName);

  const range = `${sheetName}!A1:I1`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return;
  const data = await res.json() as { values?: string[][] };
  if (data.values && data.values[0]?.length > 0) return;

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values: [BOOKING_HEADERS] }),
    }
  );
}

export async function appendBookingRow(tenantId: string, booking: BookingRow): Promise<void> {
  let token: string;
  let config: SheetsConfig;

  try {
    ({ token, config } = await getSheetsConfig(tenantId));
  } catch {
    // Sheets not connected for this tenant — silently skip
    console.warn(`⚠️ Google Sheets not connected for tenant ${tenantId} — booking row skipped`);
    return;
  }

  const bookingSheetName = 'Bookings';
  await ensureBookingHeaders(token, config.spreadsheet_id, bookingSheetName);

  // Format slot time: '19:00:00' → '7:00 PM'
  const formatTime = (t: string) => {
    try {
      const [h, m] = t.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return t; }
  };

  const values = [[
    booking.reservation_id,
    booking.customer_name,
    booking.customer_phone,
    String(booking.party_size),
    booking.booking_date,
    formatTime(booking.slot_time),
    booking.booking_status,
    String(Math.round(booking.payment_amount / 100)),
    (booking as BookingRow & { special_request?: string }).special_request ?? '',
  ]];

  const range = `${bookingSheetName}!A:I`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values }),
    }
  );

  if (!res.ok) throw new Error(`Sheets booking append failed: ${await res.text()}`);
}
