// ═══════════════════════════════════════════════════════════
// Google Sheets Integration
// ═══════════════════════════════════════════════════════════
// OAuth 2.0 + Sheets API v4.
// Separate from Google Calendar — tenant can connect one or both.
// Tokens stored encrypted in tenant_integrations (integration_id: 'google_sheets').
//
// Auto-sync: Postgres triggers on leads/conversations/bookings/shopify_events
// enqueue rows into google_sheets_sync_queue; GoogleSheetsWorkerService drains
// that queue (webhook after() hook + daily cron backstop) and calls
// syncCustomerToSheet()/syncAllLeads() below, which are mapping-aware and
// write into whatever columns the tenant configured (see column_mappings).
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptToken, decryptToken } from '@/lib/utils/crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

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

  // Fetch user's Google Account email
  let connectedEmail = '';
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as { email?: string };
      if (profile.email) {
        connectedEmail = profile.email;
        console.log('🔍 [GSHEETS exchange] resolved Google account email:', connectedEmail);
      }
    }
  } catch (err) {
    console.error('🔍 [GSHEETS exchange] failed to fetch profile email (non-fatal):', err);
  }

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

  // Load existing configuration to preserve worksheets and mappings on reconnect
  const { data: existingRow } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'google_sheets')
    .maybeSingle();
  const existingCfg = (existingRow?.config as any) || {};

  const config = {
    ...existingCfg,
    access_token:   encryptedAccess,
    refresh_token:  encryptedRefresh || existingCfg.refresh_token,
    expires_at:     Date.now() + tokens.expires_in * 1000,
    spreadsheet_id: spreadsheetId || existingCfg.spreadsheet_id,
    sheet_name:     existingCfg.sheet_name || 'Leads',
    connected_email: connectedEmail || existingCfg.connected_email || '',
  };

  // Validate all required OAuth storage fields are present
  const missingFields: string[] = [];
  if (!config.access_token) missingFields.push('Access Token');
  if (!config.refresh_token) missingFields.push('Refresh Token');
  if (!config.expires_at) missingFields.push('Expiration Time');
  if (!config.spreadsheet_id) missingFields.push('Spreadsheet ID');
  if (!config.connected_email) missingFields.push('Google Account Email');

  if (missingFields.length > 0) {
    throw new Error(`OAuth storage validation failed: missing required fields (${missingFields.join(', ')}). Please disconnect and reconnect your Google account.`);
  }

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

interface SheetsConfig {
  access_token:   string;
  refresh_token:  string;
  expires_at:     number;
  spreadsheet_id: string;
  sheet_name:     string;
  connected_email?: string;
  auth_error?: string;
  auth_error_at?: string;
}

// ── Refresh Token and Persist ──
async function refreshSheetsToken(tenantId: string, cfg: SheetsConfig): Promise<SheetsConfig> {
  const decRefreshToken = decryptToken(cfg.refresh_token);
  if (!decRefreshToken) {
    throw new Error('Missing refresh token');
  }

  console.log(`📡 [GSHEETS refresh] Refreshing token for tenant ${tenantId}...`);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId(),
      client_secret: clientSecret(),
      refresh_token: decRefreshToken,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`❌ [GSHEETS refresh] Google token refresh failed:`, errText);
    
    // Catch specific grant/credentials failures
    if (errText.includes('invalid_grant') || errText.includes('revoked') || errText.includes('expired')) {
      throw new Error(`revoked: ${errText}`);
    }
    throw new Error(`refresh_failed: ${errText}`);
  }

  const refreshed = await res.json() as { access_token: string; expires_in: number };
  const newCfg: SheetsConfig = {
    ...cfg,
    access_token: encryptToken(refreshed.access_token) ?? cfg.access_token,
    expires_at:   Date.now() + refreshed.expires_in * 1000,
  };

  await supabaseAdmin
    .from('tenant_integrations')
    .update({ 
      config: newCfg,
      updated_at: new Date().toISOString() 
    })
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'google_sheets');

  console.log(`✅ [GSHEETS refresh] Token refreshed successfully for tenant ${tenantId}`);
  return newCfg;
}

// ── Fetch with Retry Wrapper (handles 401 unauthenticated transparently) ──
async function fetchWithRetry(tenantId: string, url: string, init: RequestInit = {}): Promise<Response> {
  const { token, config } = await getSheetsConfig(tenantId);
  
  const headers = {
    ...(init.headers as Record<string, string>),
    Authorization: `Bearer ${token}`,
  };
  
  let res = await fetch(url, { ...init, headers });
  
  if (res.status === 401) {
    console.warn(`⚠️ [GSHEETS] Received 401 unauthenticated for tenant ${tenantId}. Forcing token refresh...`);
    try {
      const refreshedCfg = await refreshSheetsToken(tenantId, config);
      const newToken = decryptToken(refreshedCfg.access_token);
      
      const newHeaders = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      };
      
      // Retry same request
      res = await fetch(url, { ...init, headers: newHeaders });
      console.log(`✅ [GSHEETS] Retry after token refresh succeeded.`);
    } catch (err: any) {
      if (err.message.startsWith('revoked')) {
        const updatedCfg = {
          ...config,
          auth_error: 'Authentication Required (credentials revoked or expired)',
          auth_error_at: new Date().toISOString(),
        };
        await supabaseAdmin
          .from('tenant_integrations')
          .update({
            is_active: false,
            config: updatedCfg,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('integration_id', 'google_sheets');
        
        throw new Error('OAuth connection revoked by Google. Re-authentication required in dashboard.');
      }
      throw err;
    }
  }
  return res;
}

async function getSheetsConfig(tenantId: string): Promise<{ token: string; config: SheetsConfig }> {
  const { data, error } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config, is_active')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'google_sheets')
    .single();

  if (error || !data) throw new Error('Google Sheets not connected for this tenant');
  
  // If connection is disabled due to auth error, block sync
  if (!data.is_active && (data.config as any)?.auth_error) {
    throw new Error('Google Sheets synchronization suspended: re-authentication required.');
  }

  const cfg = data.config as SheetsConfig;

  // Proactive refresh: if token expires in less than 60 seconds, refresh it now
  if (cfg.expires_at && Date.now() < cfg.expires_at - 60_000) {
    return { token: decryptToken(cfg.access_token) as string, config: cfg };
  }

  // If there is no refresh token or expiration info, return the current access token
  if (!cfg.refresh_token || !cfg.expires_at) {
    return { token: decryptToken(cfg.access_token) as string, config: cfg };
  }

  try {
    const refreshedCfg = await refreshSheetsToken(tenantId, cfg);
    return { token: decryptToken(refreshedCfg.access_token) as string, config: refreshedCfg };
  } catch (err: any) {
    if (err.message.startsWith('revoked')) {
      const updatedCfg = {
        ...cfg,
        auth_error: 'Authentication Required (credentials revoked or expired)',
        auth_error_at: new Date().toISOString(),
      };
      await supabaseAdmin
        .from('tenant_integrations')
        .update({
          is_active: false,
          config: updatedCfg,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('integration_id', 'google_sheets');

      throw new Error('OAuth connection revoked by Google. Re-authentication required in dashboard.');
    }
    throw err;
  }
}

// ── Ensure sheet/tab exists dynamically ─────────────────────
async function ensureSheetExists(tenantId: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const metaRes = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
  );

  if (!metaRes.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${await metaRes.text()}`);
  }

  const meta = await metaRes.json() as { sheets?: Array<{ properties?: { title?: string } }> };
  const exists = meta.sheets?.some(s => s.properties?.title === sheetName);
  if (exists) return;

  console.log(`⚙️ [GSHEETS] Creating sheet tab "${sheetName}" in spreadsheet ${spreadsheetId}...`);
  const createRes = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
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

// ── Source labelling ────────────────────────────────────────
// lead.channel is almost always "whatsapp" (the messaging channel itself,
// not where the customer came from) — the meaningful acquisition source
// lives in lead.source_detail (e.g. "meta_ctwa"). Fall back to channel only
// if source_detail is unset.
const SOURCE_LABELS: Record<string, string> = {
  meta_ctwa: 'Meta Ad', whatsapp: 'WhatsApp', instagram: 'Instagram', manual: 'Manual',
};

function resolveSourceLabel(lead: Record<string, any>): string {
  return (
    SOURCE_LABELS[lead.source_detail ?? ''] ??
    SOURCE_LABELS[lead.channel ?? ''] ??
    lead.source_detail ??
    lead.channel ??
    ''
  );
}

// Fields derivable purely from a `leads` row (+ its assigned_user join), with
// no conversation/booking/shopify joins. Used by the bulk resync below;
// syncCustomerToSheet() layers richer conversation-derived enrichment on top
// of this same lead data for its live per-customer sync.
function resolveBulkLeadFields(lead: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};

  fields['name'] = lead.name || '';
  fields['whatsapp_name'] = lead.name || '';
  fields['phone'] = lead.phone || '';
  fields['email'] = lead.email || '';
  fields['source'] = resolveSourceLabel(lead);
  fields['status'] = lead.lead_status || 'new';
  fields['notes'] = lead.notes || '';
  fields['tags'] = lead.tags ? lead.tags.join(', ') : '';

  fields['assigned_to_name'] = lead.assigned_user?.full_name || lead.assigned_user?.email || lead.staff_assigned || '';
  fields['owner'] = fields['assigned_to_name'];
  fields['assigned_at'] = lead.assigned_at ? new Date(lead.assigned_at).toISOString().slice(0, 19).replace('T', ' ') : '';

  fields['created_at'] = lead.created_at ? lead.created_at.slice(0, 10) : '';
  fields['first_contact_time'] = lead.first_message_at ? new Date(lead.first_message_at).toISOString().slice(0, 19).replace('T', ' ') : '';
  fields['last_contact_time'] = lead.last_message_at ? new Date(lead.last_message_at).toISOString().slice(0, 19).replace('T', ' ') : '';

  const leadUpdate = lead.updated_at ? new Date(lead.updated_at).getTime() : 0;
  const leadMsg = lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0;
  const leadActivityAt = lead.last_activity_at ? new Date(lead.last_activity_at).getTime() : 0;
  const maxTime = Math.max(leadUpdate, leadMsg, leadActivityAt);
  fields['last_activity'] = maxTime > 0 ? new Date(maxTime).toISOString().slice(0, 19).replace('T', ' ') : '';

  return fields;
}

// ── Bulk sync: write ALL tenant leads to the sheet ─────────
// Respects the tenant's configured column mapping (and strict_schema) so a
// manual "Sync Now" never clobbers a hand-built sheet layout with the wrong
// schema — it writes into whichever headers already exist on the sheet.
export async function syncAllLeads(tenantId: string): Promise<{ synced: number }> {
  const { config } = await getSheetsConfig(tenantId);
  const sheetName = config.sheet_name || 'Leads';
  const customMappings = (config as any).column_mappings || {};
  const mappings = (config as any).strict_schema
    ? customMappings
    : { ...DEFAULT_COLUMN_MAPPINGS, ...customMappings };

  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('*, assigned_user:assigned_to(full_name, email)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Leads query failed: ${error.message}`);
  if (!leads || leads.length === 0) return { synced: 0 };

  await ensureSheetExists(tenantId, config.spreadsheet_id, sheetName);

  // Prefer the sheet's own existing header row (respects a hand-built
  // layout); only fall back to the configured mapping if the sheet is empty.
  const headerRange = `${sheetName}!A1:ZZ1`;
  const headerRes = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(headerRange)}`
  );
  let sheetHeaders: string[] = [];
  if (headerRes.ok) {
    const hData = await headerRes.json() as { values?: string[][] };
    sheetHeaders = hData.values?.[0] || [];
  }
  if (sheetHeaders.length === 0) {
    sheetHeaders = Object.keys(mappings);
  }

  const rows = leads.map(l => {
    const resolved = resolveBulkLeadFields(l as Record<string, any>);
    return sheetHeaders.map(header => {
      const key = mappings[header];
      return key && resolved[key] !== undefined ? resolved[key] : '';
    });
  });

  const lastCol = getColumnLetter(sheetHeaders.length - 1);

  // Clear existing data rows only — the header row (row 1) is left intact.
  const clearRange = `${sheetName}!A2:${lastCol}`;
  await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(clearRange)}:clear`,
    { method: 'POST' }
  );

  const writeRange = `${sheetName}!A1`;
  const res = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`,
    {
      method:  'PUT',
      body:    JSON.stringify({ values: [sheetHeaders, ...rows] }),
    }
  );

  if (!res.ok) throw new Error(`Sheets bulk write failed: ${await res.text()}`);
  return { synced: leads.length };
}

// ══ Booking Rows (Restaurant Manager Panel) ═════════════════════
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
  special_request?: string;
  discount?:       string;
  table_name?:     string;   // assigned physical table (e.g. 'T5'), if any
}

const BOOKING_HEADERS = [
  'Customer', 'Phone', 'Guests', 'Date', 'Time', 'Status', 'Deposit (₹)', 'Special Request', 'Discount', 'Table',
];

async function ensureBookingHeaders(
  tenantId:      string,
  spreadsheetId: string,
  sheetName:     string
): Promise<void> {
  await ensureSheetExists(tenantId, spreadsheetId, sheetName);

  const range = `${sheetName}!A1:J1`;
  const res = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  );
  if (!res.ok) return;
  const data = await res.json() as { values?: string[][] };
  const existing = data.values?.[0] ?? [];
  if (existing.length >= BOOKING_HEADERS.length) return;

  await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method:  'PUT',
      body:    JSON.stringify({ values: [BOOKING_HEADERS] }),
    }
  );
}

export async function appendBookingRow(tenantId: string, booking: BookingRow): Promise<void> {
  let config: SheetsConfig;

  try {
    ({ config } = await getSheetsConfig(tenantId));
  } catch {
    // Sheets not connected for this tenant — silently skip
    console.warn(`⚠️ Google Sheets not connected for tenant ${tenantId} — booking row skipped`);
    return;
  }

  const bookingSheetName = 'Bookings';
  await ensureBookingHeaders(tenantId, config.spreadsheet_id, bookingSheetName);

  // Format slot time: '19:00:00' → '7:00 PM' (pure arithmetic)
  const formatTime = (t: string): string => {
    try {
      const parts = t.split(':');
      let h = parseInt(parts[0], 10);
      const m = parseInt(parts[1] || '0', 10);
      if (isNaN(h)) return t;
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12; // midnight/noon → 12
      const mStr = String(m).padStart(2, '0');
      return `${h}:${mStr} ${ampm}`;
    } catch { return t; }
  };

  // Format booking date: 'YYYY-MM-DD' → '31 May 2026' (human-readable)
  const formatDate = (d: string): string => {
    try {
      const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const year  = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1; // 0-indexed
        const day   = parseInt(isoMatch[3], 10);
        return `${day} ${MONTH_NAMES[month]} ${year}`;
      }
      return d; // fallback
    } catch { return d; }
  };

  const formattedDate = formatDate(booking.booking_date);
  const formattedTime = formatTime(booking.slot_time);
  console.log(`📊 [GSHEETS] Appending booking row: ${booking.customer_name} | Date: ${formattedDate} | Time: ${formattedTime}`);

  const values = [[
    booking.customer_name,
    booking.customer_phone,
    String(booking.party_size),
    formattedDate,
    formattedTime,
    booking.booking_status,
    String(Math.round((booking.payment_amount || 0) / 100)), // payment_amount is paise → ₹
    booking.special_request ?? '',
    booking.discount ?? '',
    booking.table_name ?? '',
  ]];

  const range = `${bookingSheetName}!A:J`;
  const res = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method:  'POST',
      body:    JSON.stringify({ values }),
    }
  );

  if (!res.ok) throw new Error(`Sheets booking append failed: ${await res.text()}`);
}

// ── Default Column Mappings & Resolver for Live CRM Mirror ──

export const DEFAULT_COLUMN_MAPPINGS: Record<string, string> = {
  'Customer Name': 'name',
  'WhatsApp Number': 'phone',
  'Lead Source': 'source',
  'Lead Status': 'status',
  'Assigned To': 'assigned_to_name',
  'Assigned At': 'assigned_at',
  'First Contact': 'first_contact_time',
  'Last Activity': 'last_activity',
  'Latest Message': 'latest_message',
  'Tags': 'tags'
};

export async function getCustomerSyncData(tenantId: string, phone: string) {
  // 1. Fetch lead
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('*, assigned_user:assigned_to(full_name, email)')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle();

  if (leadError) {
    console.error('❌ [GSHEETS sync] error fetching lead:', leadError.message);
  }
  if (!lead) return null;

  // 2. Fetch active conversation
  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Fetch latest messages (if conversation exists)
  let messages: any[] = [];
  if (conversation) {
    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });
    messages = msgs || [];
  }

  // 4. Fetch bookings count, total spend and timestamps
  const { data: bookings } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('id, payment_amount, booking_status, updated_at')
    .eq('restaurant_id', tenantId)
    .eq('customer_phone', phone);
  
  const reservationCount = bookings?.filter((b: any) => b.booking_status === 'confirmed').length || 0;
  const totalBookingSpend = bookings?.reduce((sum: number, b: any) => sum + (b.payment_amount || 0), 0) || 0;

  // 5. Fetch shopify events/orders and timestamps
  const { data: shopifyEvents } = await supabaseAdmin
    .from('shopify_events')
    .select('id, order_value, event_type, created_at')
    .eq('tenant_id', tenantId)
    .eq('lead_id', lead.id);

  const orderCount = shopifyEvents?.filter((e: any) => e.event_type === 'order_created').length || 0;
  const totalShopifySpend = shopifyEvents?.reduce((sum: number, e: any) => sum + Number(e.order_value || 0), 0) || 0;

  // 6. Fetch latest broadcast delivery
  const { data: broadcastDelivery } = await supabaseAdmin
    .from('broadcast_deliveries')
    .select('*, campaign:campaign_id(name)')
    .eq('tenant_id', tenantId)
    .eq('contact_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    lead,
    conversation,
    messages,
    reservationCount,
    totalBookingSpend: totalBookingSpend / 100, // paise to ₹
    orderCount,
    totalShopifySpend,
    broadcastDelivery,
    bookings,
    shopifyEvents
  };
}

// Convert a column index to Excel column letters (0 -> A, 27 -> AB)
function getColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export async function syncCustomerToSheet(tenantId: string, phone: string): Promise<{ action: 'create' | 'update'; latencyMs: number }> {
  const t0 = Date.now();
  
  // 1. Fetch latest data
  const data = await getCustomerSyncData(tenantId, phone);
  if (!data) {
    throw new Error(`Customer lead details not found for phone: ${phone}`);
  }

  const { lead, conversation, messages, reservationCount, totalBookingSpend, orderCount, totalShopifySpend, broadcastDelivery, bookings, shopifyEvents } = data;

  // 2. Load configurations
  const { token, config } = await getSheetsConfig(tenantId);
  const sheetName = config.sheet_name || 'Leads';
  const customMappings = (config as any).column_mappings || {};

  // Tenants with a hand-built sheet layout (strict_schema) use ONLY their
  // explicit mappings — otherwise every DEFAULT_COLUMN_MAPPINGS header not
  // already on the sheet gets auto-appended as a stray extra column.
  const mappings = (config as any).strict_schema
    ? customMappings
    : { ...DEFAULT_COLUMN_MAPPINGS, ...customMappings };

  // 3. Resolve all CRM fields
  const resolvedFields: Record<string, any> = {};

  // Contact info
  resolvedFields['name'] = lead.name || '';
  resolvedFields['whatsapp_name'] = conversation?.sender_name || lead.name || '';
  resolvedFields['phone'] = phone;
  
  const rawPhone = phone.replace(/^\+/, '');
  resolvedFields['country_code'] = rawPhone.length > 10 ? rawPhone.slice(0, rawPhone.length - 10) : '';
  resolvedFields['full_phone'] = phone;
  resolvedFields['email'] = lead.email || '';
  
  // City, State, Country from metadata/context
  const ctx = (conversation?.context as any) || {};
  resolvedFields['city'] = ctx.city || ctx.location || '';
  resolvedFields['state'] = ctx.state || '';
  resolvedFields['country'] = ctx.country || (rawPhone.startsWith('91') ? 'India' : '');
  resolvedFields['language'] = ctx.language || 'English';
  resolvedFields['created_at'] = lead.created_at ? new Date(lead.created_at).toISOString().slice(0, 19).replace('T', ' ') : '';
  resolvedFields['first_contact_time'] = lead.first_message_at ? new Date(lead.first_message_at).toISOString().slice(0, 19).replace('T', ' ') : '';
  resolvedFields['last_contact_time'] = lead.last_message_at ? new Date(lead.last_message_at).toISOString().slice(0, 19).replace('T', ' ') : '';
  
  // Dynamic Last Activity Calculation (maximum of lead, messages, bookings, shopify events)
  const leadUpdate = lead.updated_at ? new Date(lead.updated_at).getTime() : 0;
  const leadMsg = lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0;
  const leadActivityAt = lead.last_activity_at ? new Date(lead.last_activity_at).getTime() : 0;
  let maxBookingTime = 0;
  if (bookings && bookings.length > 0) {
    maxBookingTime = Math.max(...bookings.map((b: any) => b.updated_at ? new Date(b.updated_at).getTime() : 0));
  }
  let maxShopifyTime = 0;
  if (shopifyEvents && shopifyEvents.length > 0) {
    maxShopifyTime = Math.max(...shopifyEvents.map((e: any) => e.created_at ? new Date(e.created_at).getTime() : 0));
  }
  const maxTime = Math.max(leadUpdate, leadMsg, leadActivityAt, maxBookingTime, maxShopifyTime);
  resolvedFields['last_activity'] = maxTime > 0 ? new Date(maxTime).toISOString().slice(0, 19).replace('T', ' ') : '';

  resolvedFields['status'] = lead.lead_status || 'new';
  resolvedFields['ai_summary'] = ctx.ai_summary || ctx.summary || '';
  resolvedFields['notes'] = lead.notes || '';
  resolvedFields['tags'] = lead.tags ? lead.tags.join(', ') : '';

  // Lead Source
  resolvedFields['source'] = resolveSourceLabel(lead);
  resolvedFields['campaign_name'] = lead.fb_campaign_name || broadcastDelivery?.campaign?.name || '';
  resolvedFields['campaign_id'] = lead.campaign_id || lead.meta_campaign_id || broadcastDelivery?.campaign_id || '';
  resolvedFields['ad_set'] = lead.fb_adset_name || '';
  resolvedFields['ad_name'] = lead.fb_ad_name || '';

  // Assignment
  resolvedFields['assigned_to_name'] = lead.assigned_user?.full_name || lead.assigned_user?.email || lead.staff_assigned || '';
  resolvedFields['assigned_at'] = lead.assigned_at ? new Date(lead.assigned_at).toISOString().slice(0, 19).replace('T', ' ') : '';
  resolvedFields['assigned_agent'] = ctx.assigned_agent || '';
  resolvedFields['assignment_time'] = ctx.assignment_time || '';
  resolvedFields['assigned_by'] = ctx.assigned_by || '';
  resolvedFields['department'] = ctx.department || '';
  resolvedFields['owner'] = resolvedFields['assigned_to_name'];

  // Conversation tracking
  resolvedFields['conversation_id'] = conversation?.id || '';
  resolvedFields['first_message'] = messages[0]?.content || '';
  resolvedFields['latest_message'] = messages[messages.length - 1]?.content || '';
  resolvedFields['message_count'] = conversation?.message_count || messages.length || 0;
  resolvedFields['unread_count'] = ctx.unread_count || 0;
  
  const inboundMsgs = messages.filter(m => m.direction === 'inbound');
  const outboundMsgs = messages.filter(m => m.direction === 'outbound');
  resolvedFields['last_incoming'] = inboundMsgs[inboundMsgs.length - 1]?.content || '';
  resolvedFields['last_outgoing'] = outboundMsgs[outboundMsgs.length - 1]?.content || '';
  
  const aiMsgs = messages.filter(m => m.direction === 'outbound' && m.ai_generated);
  const humanMsgs = messages.filter(m => m.direction === 'outbound' && !m.ai_generated);
  resolvedFields['last_ai_response'] = aiMsgs[aiMsgs.length - 1]?.content || '';
  resolvedFields['last_human_response'] = humanMsgs[humanMsgs.length - 1]?.content || '';
  resolvedFields['conv_status'] = conversation ? (conversation.is_active ? (conversation.escalated ? 'Escalated' : 'Open') : 'Resolved') : '';

  // Lifecycle
  resolvedFields['first_seen'] = resolvedFields['created_at'];
  resolvedFields['last_seen'] = resolvedFields['last_contact_time'];
  resolvedFields['last_updated'] = resolvedFields['last_activity'];
  resolvedFields['visit_count'] = reservationCount;
  resolvedFields['reservation_count'] = reservationCount;
  resolvedFields['order_count'] = orderCount;
  resolvedFields['total_spend'] = Number(totalBookingSpend) + Number(totalShopifySpend);
  resolvedFields['vip_status'] = resolvedFields['total_spend'] > 5000 || reservationCount > 5 ? 'VIP' : 'Standard';

  let stage = 'New';
  if (lead.lead_status === 'lost') stage = 'Lost';
  else if (reservationCount > 1 || orderCount > 1) stage = 'Returning';
  else if (reservationCount === 1 || orderCount === 1 || lead.lead_status === 'converted') stage = 'Active';
  resolvedFields['customer_stage'] = stage;

  // Automation
  resolvedFields['automation_triggered'] = ctx.automation_triggered ? 'TRUE' : 'FALSE';
  resolvedFields['flow_name'] = ctx.flow_name || '';
  resolvedFields['automation_status'] = ctx.automation_status || '';
  resolvedFields['ai_handoff'] = ctx.ai_handoff ? 'TRUE' : 'FALSE';
  resolvedFields['human_handoff'] = conversation?.bot_paused ? 'TRUE' : 'FALSE';
  resolvedFields['escalation'] = conversation?.escalated ? 'TRUE' : 'FALSE';

  // Broadcast
  resolvedFields['broadcast_name'] = broadcastDelivery?.campaign?.name || '';
  resolvedFields['broadcast_id'] = broadcastDelivery?.campaign_id || '';
  resolvedFields['broadcast_status'] = broadcastDelivery?.status || '';
  resolvedFields['broadcast_replied'] = broadcastDelivery?.replied ? 'TRUE' : 'FALSE';
  resolvedFields['broadcast_reply_time'] = broadcastDelivery?.reply_time ? new Date(broadcastDelivery.reply_time).toISOString().slice(0, 19).replace('T', ' ') : '';

  // 4. Ensure worksheet exists
  await ensureSheetExists(tenantId, config.spreadsheet_id, sheetName);

  // 5. Fetch worksheet headers
  const headerRange = `${sheetName}!A1:ZZ1`;
  const headerRes = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(headerRange)}`
  );

  let sheetHeaders: string[] = [];
  if (headerRes.ok) {
    const hData = await headerRes.json() as { values?: string[][] };
    sheetHeaders = hData.values?.[0] || [];
  }

  // 6. Check for missing columns & auto-schema updates
  const defaultHeaders = Object.keys(mappings);
  
  if (sheetHeaders.length === 0) {
    // Empty sheet: write all default headers
    sheetHeaders = defaultHeaders;
    await fetchWithRetry(
      tenantId,
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [sheetHeaders] }),
      }
    );
    console.log(`✅ [GSHEETS sync] initialized new headers in sheet: ${sheetName}`);
  } else {
    // Existing sheet: check if any default headers are missing
    const missingHeaders = defaultHeaders.filter(h => !sheetHeaders.includes(h));
    if (missingHeaders.length > 0) {
      const updatedHeaders = [...sheetHeaders, ...missingHeaders];
      const newHeaderRange = `${sheetName}!A1:${getColumnLetter(updatedHeaders.length - 1)}1`;
      
      await fetchWithRetry(
        tenantId,
        `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(newHeaderRange)}?valueInputOption=RAW`,
        {
          method: 'PUT',
          body: JSON.stringify({ values: [updatedHeaders] }),
        }
      );
      sheetHeaders = updatedHeaders;
      console.log(`✅ [GSHEETS sync] auto-updated sheet schema with ${missingHeaders.length} new headers`);
    }
  }

  // 7. Find phone number column index
  let phoneColIdx = sheetHeaders.indexOf('Phone Number');
  if (phoneColIdx === -1) phoneColIdx = sheetHeaders.indexOf('Phone');
  if (phoneColIdx === -1) {
    // If phone number header isn't found, find which header is mapped to the 'phone' key
    phoneColIdx = sheetHeaders.findIndex(h => mappings[h] === 'phone');
  }
  // Default to index 2 (Col C) if not found at all
  if (phoneColIdx === -1) phoneColIdx = 2;

  const phoneColLetter = getColumnLetter(phoneColIdx);

  // 8. Fetch phone column values to check for duplicates
  const phoneColRange = `${sheetName}!${phoneColLetter}:${phoneColLetter}`;
  const phoneColRes = await fetchWithRetry(
    tenantId,
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(phoneColRange)}`
  );

  let phoneList: string[] = [];
  if (phoneColRes.ok) {
    const pData = await phoneColRes.json() as { values?: string[][] };
    phoneList = pData.values?.map(row => row[0] || '') || [];
  }

  // Normalize numbers for comparison (remove spaces, symbols, plus sign)
  const normPhone = (num: string) => num.replace(/[\s\+\-\(\)]/g, '');
  const targetNorm = normPhone(phone);
  
  const existingRowIdx = phoneList.findIndex((p, idx) => idx > 0 && normPhone(p) === targetNorm); // idx > 0 to skip header row

  // 9. Format row values matching headers
  const rowValues = sheetHeaders.map(header => {
    const key = mappings[header];
    if (!key) return '';
    return resolvedFields[key] !== undefined ? resolvedFields[key] : '';
  });

  let action: 'create' | 'update';

  if (existingRowIdx !== -1) {
    // Row exists -> Update row
    const rowNum = existingRowIdx + 1;
    const updateRange = `${sheetName}!A${rowNum}:${getColumnLetter(sheetHeaders.length - 1)}${rowNum}`;
    
    const updateRes = await fetchWithRetry(
      tenantId,
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [rowValues] }),
      }
    );

    if (!updateRes.ok) {
      throw new Error(`Sheets row update failed: ${await updateRes.text()}`);
    }
    action = 'update';
    console.log(`✅ [GSHEETS sync] updated customer row A${rowNum} for ${phone}`);
  } else {
    // Row does not exist -> Append new row
    const appendRange = `${sheetName}!A:${getColumnLetter(sheetHeaders.length - 1)}`;
    const appendRes = await fetchWithRetry(
      tenantId,
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        body: JSON.stringify({ values: [rowValues] }),
      }
    );

    if (!appendRes.ok) {
      throw new Error(`Sheets row append failed: ${await appendRes.text()}`);
    }
    action = 'create';
    console.log(`✅ [GSHEETS sync] appended new customer row for ${phone}`);
  }

  const latencyMs = Date.now() - t0;
  return { action, latencyMs };
}

