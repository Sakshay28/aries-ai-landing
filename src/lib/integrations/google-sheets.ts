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
export function getGoogleSheetsAuthUrl(tenantId: string): string {
  const params = new URLSearchParams({
    client_id:     clientId(),
    redirect_uri:  redirectUri(),
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state:         tenantId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Exchange code + store (tenant provides their Sheet URL/ID) ──
export async function exchangeAndStoreSheets(
  code:            string,
  tenantId:        string,
  spreadsheetId:   string,   // from query param state or post-auth config
): Promise<void> {
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

  if (!res.ok) throw new Error(`Sheets token exchange failed: ${await res.text()}`);

  const tokens = await res.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  const config = {
    access_token:   encryptToken(tokens.access_token),
    refresh_token:  encryptToken(tokens.refresh_token),
    expires_at:     Date.now() + tokens.expires_in * 1000,
    spreadsheet_id: spreadsheetId,
    sheet_name:     'Leads',
  };

  await supabaseAdmin
    .from('tenant_integrations')
    .upsert(
      { tenant_id: tenantId, integration_id: 'google_sheets', config, is_active: true },
      { onConflict: 'tenant_id,integration_id' }
    );
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

// ── Ensure header row exists (idempotent) ──────────────────
const HEADERS = ['Name', 'Phone', 'Email', 'Status', 'Source', 'Score', 'Created At'];

async function ensureHeaders(token: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const range = `${sheetName}!A1:G1`;
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

  const range   = `${config.sheet_name}!A:G`;
  const values  = [[
    lead.name        ?? '',
    lead.phone       ?? '',
    lead.email       ?? '',
    lead.lead_status ?? '',
    lead.source      ?? '',
    String(lead.lead_score ?? ''),
    lead.created_at  ? new Date(lead.created_at).toLocaleString('en-IN') : '',
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
    .select('name, phone, email, lead_status, source, lead_score, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Leads query failed: ${error.message}`);
  if (!leads || leads.length === 0) return { synced: 0 };

  // Clear existing data and rewrite (clean sync)
  const clearRange = `${config.sheet_name}!A:G`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${encodeURIComponent(clearRange)}:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  );

  const rows = [
    HEADERS,
    ...leads.map(l => [
      l.name        ?? '',
      l.phone       ?? '',
      l.email       ?? '',
      l.lead_status ?? '',
      l.source      ?? '',
      String(l.lead_score ?? ''),
      l.created_at  ? new Date(l.created_at as string).toLocaleString('en-IN') : '',
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
