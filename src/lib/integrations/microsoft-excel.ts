// ═══════════════════════════════════════════════════════════
// Microsoft Excel Online Integration (Office 365 / OneDrive)
// ═══════════════════════════════════════════════════════════
// OAuth 2.0 + Microsoft Graph API.
// Tokens stored encrypted in tenant_integrations (integration_id: 'microsoft_excel').
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptToken, decryptToken } from '@/lib/utils/crypto';

const SCOPES = ['offline_access', 'Files.ReadWrite', 'User.Read'].join(' ');

function clientId()     { return process.env.MICROSOFT_CLIENT_ID!; }
function clientSecret() { return process.env.MICROSOFT_CLIENT_SECRET!; }
function redirectUri()  {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/microsoft-excel/callback`;
}

// ── Build OAuth URL ────────────────────────────────────────
export function getMicrosoftExcelAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     clientId(),
    redirect_uri:  redirectUri(),
    response_type: 'code',
    response_mode: 'query',
    scope:         SCOPES,
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

// ── Exchange code + store (tenant provides their Workbook URL/ID) ──
export async function exchangeAndStoreExcel(
  code:            string,
  tenantId:        string,
  workbookId:      string,
): Promise<void> {
  console.log('🔍 [EXCEL exchange] starting for tenant:', tenantId, 'workbook:', workbookId);

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
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
    console.error('🔍 [EXCEL exchange] token exchange failed:', errText);
    throw new Error(`Excel token exchange failed: ${errText}`);
  }

  const tokens = await res.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  // Fetch user's Microsoft Account profile info
  let connectedEmail = '';
  try {
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as { mail?: string; userPrincipalName?: string };
      connectedEmail = profile.mail || profile.userPrincipalName || '';
      console.log('🔍 [EXCEL exchange] resolved Microsoft account email:', connectedEmail);
    }
  } catch (err) {
    console.error('🔍 [EXCEL exchange] failed to fetch profile email (non-fatal):', err);
  }

  let encryptedAccess: string | null;
  let encryptedRefresh: string | null;
  try {
    encryptedAccess = encryptToken(tokens.access_token);
    encryptedRefresh = encryptToken(tokens.refresh_token);
  } catch (encErr) {
    console.error('🔍 [EXCEL exchange] encryption failed:', encErr);
    throw new Error(`Token encryption failed: ${(encErr as Error).message}`);
  }

  // Load existing configuration to preserve worksheets and mappings on reconnect
  const { data: existingRow } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'microsoft_excel')
    .maybeSingle();
  const existingCfg = (existingRow?.config as any) || {};

  const config = {
    ...existingCfg,
    access_token:   encryptedAccess,
    refresh_token:  encryptedRefresh || existingCfg.refresh_token,
    expires_at:     Date.now() + tokens.expires_in * 1000,
    spreadsheet_id: workbookId || existingCfg.spreadsheet_id, // maps to workbookId
    sheet_name:     existingCfg.sheet_name || 'Leads',
    connected_email: connectedEmail || existingCfg.connected_email || '',
  };

  // Validate all required OAuth storage fields are present
  const missingFields: string[] = [];
  if (!config.access_token) missingFields.push('Access Token');
  if (!config.refresh_token) missingFields.push('Refresh Token');
  if (!config.expires_at) missingFields.push('Expiration Time');
  if (!config.spreadsheet_id) missingFields.push('Workbook ID');
  if (!config.connected_email) missingFields.push('Microsoft Account Email');

  if (missingFields.length > 0) {
    throw new Error(`OAuth storage validation failed: missing required fields (${missingFields.join(', ')}). Please reconnect your Microsoft account.`);
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabaseAdmin
    .from('tenant_integrations')
    .upsert(
      { tenant_id: tenantId, integration_id: 'microsoft_excel', config, is_active: true, connected_at: now, updated_at: now },
      { onConflict: 'tenant_id,integration_id' }
    );

  if (upsertError) {
    console.error('🔍 [EXCEL exchange] DB upsert failed:', upsertError.message);
    throw new Error(`Failed to save Microsoft Excel config: ${upsertError.message}`);
  }

  console.log('✅ [EXCEL exchange] SUCCESS — row saved for tenant:', tenantId);
}

export interface ExcelConfig {
  access_token:   string;
  refresh_token:  string;
  expires_at:     number;
  spreadsheet_id: string; // workbook id
  sheet_name:     string; // tab name
  connected_email?: string;
  auth_error?: string;
  auth_error_at?: string;
}

// ── Refresh Token and Persist ──
async function refreshExcelToken(tenantId: string, cfg: ExcelConfig): Promise<ExcelConfig> {
  const decRefreshToken = decryptToken(cfg.refresh_token);
  if (!decRefreshToken) {
    throw new Error('Missing refresh token');
  }

  console.log(`📡 [EXCEL refresh] Refreshing token for tenant ${tenantId}...`);
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
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
    console.error(`❌ [EXCEL refresh] Microsoft token refresh failed:`, errText);
    
    if (errText.includes('invalid_grant') || errText.includes('revoked') || errText.includes('expired')) {
      throw new Error(`revoked: ${errText}`);
    }
    throw new Error(`refresh_failed: ${errText}`);
  }

  const refreshed = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const newCfg: ExcelConfig = {
    ...cfg,
    access_token: encryptToken(refreshed.access_token) || cfg.access_token,
    refresh_token: refreshed.refresh_token ? (encryptToken(refreshed.refresh_token) || cfg.refresh_token) : cfg.refresh_token,
    expires_at:   Date.now() + refreshed.expires_in * 1000,
  };

  await supabaseAdmin
    .from('tenant_integrations')
    .update({ 
      config: newCfg,
      updated_at: new Date().toISOString() 
    })
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'microsoft_excel');

  console.log(`✅ [EXCEL refresh] Token refreshed successfully for tenant ${tenantId}`);
  return newCfg;
}

// ── Fetch with Retry Wrapper (handles 401 unauthenticated transparently) ──
async function fetchWithRetry(tenantId: string, url: string, init: RequestInit = {}): Promise<Response> {
  const { token, config } = await getExcelConfig(tenantId);
  
  const headers = {
    ...(init.headers as Record<string, string>),
    Authorization: `Bearer ${token}`,
  };
  
  let res = await fetch(url, { ...init, headers });
  
  if (res.status === 401) {
    console.warn(`⚠️ [EXCEL] Received 401 unauthenticated for tenant ${tenantId}. Forcing token refresh...`);
    try {
      const refreshedCfg = await refreshExcelToken(tenantId, config);
      const newToken = decryptToken(refreshedCfg.access_token);
      
      const newHeaders = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      };
      
      res = await fetch(url, { ...init, headers: newHeaders });
      console.log(`✅ [EXCEL] Retry after token refresh succeeded.`);
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
          .eq('integration_id', 'microsoft_excel');
        
        throw new Error('OAuth connection revoked by Microsoft. Re-authentication required in dashboard.');
      }
      throw err;
    }
  }
  return res;
}

export async function getExcelConfig(tenantId: string): Promise<{ token: string; config: ExcelConfig }> {
  const { data, error } = await supabaseAdmin
    .from('tenant_integrations')
    .select('config, is_active')
    .eq('tenant_id', tenantId)
    .eq('integration_id', 'microsoft_excel')
    .single();

  if (error || !data) throw new Error('Microsoft Excel not connected for this tenant');
  
  if (!data.is_active && (data.config as any)?.auth_error) {
    throw new Error('Microsoft Excel synchronization suspended: re-authentication required.');
  }

  const cfg = data.config as ExcelConfig;

  // Proactive refresh
  if (cfg.expires_at && Date.now() < cfg.expires_at - 60_000) {
    return { token: decryptToken(cfg.access_token) as string, config: cfg };
  }

  if (!cfg.refresh_token || !cfg.expires_at) {
    return { token: decryptToken(cfg.access_token) as string, config: cfg };
  }

  try {
    const refreshedCfg = await refreshExcelToken(tenantId, cfg);
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
        .eq('integration_id', 'microsoft_excel');

      throw new Error('OAuth connection revoked by Microsoft. Re-authentication required in dashboard.');
    }
    throw err;
  }
}

// ── Ensure sheet/tab exists dynamically ─────────────────────
async function ensureSheetExists(tenantId: string, workbookId: string, sheetName: string): Promise<void> {
  const listUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets`;
  const listRes = await fetchWithRetry(tenantId, listUrl);

  if (!listRes.ok) {
    throw new Error(`Failed to fetch workbook worksheets: ${await listRes.text()}`);
  }

  const data = await listRes.json() as { value?: Array<{ name?: string }> };
  const exists = data.value?.some(s => s.name === sheetName);
  if (exists) return;

  console.log(`⚙️ [EXCEL] Creating sheet tab "${sheetName}" in workbook ${workbookId}...`);
  const createRes = await fetchWithRetry(tenantId, listUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sheetName })
  });

  if (!createRes.ok) {
    console.error(`🔍 [EXCEL] failed to create sheet "${sheetName}":`, await createRes.text());
  } else {
    console.log(`✅ [EXCEL] Created sheet "${sheetName}" successfully.`);
  }
}

function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// ── 10 CRM Column mappings ──────────────────────────────────
export const DEFAULT_COLUMN_MAPPINGS = {
  'Customer Name': 'name',
  'WhatsApp Number': 'phone',
  'Lead Source': 'source',
  'Lead Status': 'status',
  'Assigned To': 'assigned_to_name',
  'Assigned At': 'assigned_at',
  'First Contact': 'first_seen',
  'Last Activity': 'last_activity',
  'Latest Message': 'latest_message',
  'Tags': 'tags',
};

// ── Sync Customer to Excel ──────────────────────────────────
export async function syncCustomerToExcel(tenantId: string, phone: string): Promise<{ action: 'create' | 'update'; latencyMs: number }> {
  const t0 = Date.now();
  
  // 1. Get configurations
  const { config } = await getExcelConfig(tenantId);
  const workbookId = config.spreadsheet_id;
  const sheetName = config.sheet_name || 'Leads';
  
  // Mappings
  const mappings = DEFAULT_COLUMN_MAPPINGS;
  
  // 2. Fetch customer details
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('leads')
    .select('name, phone, channel, lead_status, tags, notes, created_at, assigned_at, fb_campaign_name, campaign_id, fb_adset_name, fb_ad_name, updated_at, last_message_at, assigned_user:assigned_to(full_name, email)')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle();

  if (leadErr) throw new Error(`Excel sync failed fetching lead details: ${leadErr.message}`);
  if (!lead) throw new Error(`Customer lead details not found for phone: ${phone}`);

  // 3. Resolve metrics
  const resolvedFields: Record<string, any> = {
    name: lead.name || 'Unknown',
    phone: lead.phone,
    source: lead.channel === 'whatsapp' ? 'WhatsApp' : lead.channel === 'meta_ctwa' ? 'Meta Ad' : lead.channel || 'Manual',
    status: lead.lead_status || 'new',
    assigned_to_name: (lead.assigned_user as any)?.full_name || (lead.assigned_user as any)?.email || '',
    assigned_at: lead.assigned_at ? new Date(lead.assigned_at).toISOString().slice(0, 19).replace('T', ' ') : '',
    first_seen: lead.created_at ? new Date(lead.created_at).toISOString().slice(0, 19).replace('T', ' ') : '',
    last_activity: new Date(Math.max(
      lead.updated_at ? new Date(lead.updated_at).getTime() : 0,
      lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0
    )).toISOString().slice(0, 19).replace('T', ' '),
    tags: lead.tags ? lead.tags.join(', ') : '',
  };

  // Fetch latest message
  const { data: msg } = await supabaseAdmin
    .from('messages')
    .select('content')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  resolvedFields['latest_message'] = msg?.content || '';

  // 4. Ensure worksheet tab exists
  await ensureSheetExists(tenantId, workbookId, sheetName);

  // 5. Read used range to obtain headers and row indices
  const usedRangeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`;
  const rangeRes = await fetchWithRetry(tenantId, usedRangeUrl);

  let sheetRows: string[][] = [];
  if (rangeRes.ok) {
    const rData = await rangeRes.json() as { values?: string[][] };
    sheetRows = rData.values || [];
  }

  let sheetHeaders = sheetRows[0] || [];
  const defaultHeaders = Object.keys(mappings);

  // 6. Schema setup if workbook tab is empty
  if (sheetHeaders.length === 0) {
    sheetHeaders = defaultHeaders;
    const headerLetter = getColumnLetter(sheetHeaders.length - 1);
    const writeHeadersUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A1:${headerLetter}1')`;
    
    await fetchWithRetry(tenantId, writeHeadersUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [sheetHeaders] })
    });
    console.log(`✅ [EXCEL sync] initialized headers in sheet "${sheetName}"`);
  } else {
    // Check for missing columns
    const missingHeaders = defaultHeaders.filter(h => !sheetHeaders.includes(h));
    if (missingHeaders.length > 0) {
      const updatedHeaders = [...sheetHeaders, ...missingHeaders];
      const headerLetter = getColumnLetter(updatedHeaders.length - 1);
      const writeHeadersUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A1:${headerLetter}1')`;
      
      await fetchWithRetry(tenantId, writeHeadersUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [updatedHeaders] })
      });
      sheetHeaders = updatedHeaders;
      console.log(`✅ [EXCEL sync] auto-updated sheet schema with ${missingHeaders.length} headers`);
    }
  }

  // 7. Find phone index column for deduplication
  let phoneColIdx = sheetHeaders.indexOf('WhatsApp Number');
  if (phoneColIdx === -1) phoneColIdx = sheetHeaders.indexOf('Phone Number');
  if (phoneColIdx === -1) phoneColIdx = sheetHeaders.indexOf('Phone');
  if (phoneColIdx === -1) phoneColIdx = 1; // default to col B

  const normPhone = (num: string) => num.replace(/[\s\+\-\(\)]/g, '');
  const targetNorm = normPhone(phone);

  const existingRowIdx = sheetRows.findIndex((row, idx) => idx > 0 && row[phoneColIdx] && normPhone(row[phoneColIdx]) === targetNorm);

  const rowValues = sheetHeaders.map(h => {
    const key = (mappings as any)[h];
    return resolvedFields[key] !== undefined ? resolvedFields[key] : '';
  });

  let action: 'create' | 'update';

  if (existingRowIdx !== -1) {
    // Row exists -> Update row
    const rowNum = existingRowIdx + 1; // 1-indexed range
    const maxColLetter = getColumnLetter(sheetHeaders.length - 1);
    const writeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A${rowNum}:${maxColLetter}${rowNum}')`;

    const updateRes = await fetchWithRetry(tenantId, writeUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [rowValues] })
    });

    if (!updateRes.ok) {
      throw new Error(`Microsoft Excel row update failed: ${await updateRes.text()}`);
    }
    action = 'update';
    console.log(`✅ [EXCEL sync] updated customer row A${rowNum} for ${phone}`);
  } else {
    // Row does not exist -> Append row (insert at row count + 1)
    const nextRowNumber = sheetRows.length > 0 ? sheetRows.length + 1 : 2;
    const maxColLetter = getColumnLetter(sheetHeaders.length - 1);
    const writeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${encodeURIComponent(sheetName)}/range(address='A${nextRowNumber}:${maxColLetter}${nextRowNumber}')`;

    const appendRes = await fetchWithRetry(tenantId, writeUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [rowValues] })
    });

    if (!appendRes.ok) {
      throw new Error(`Microsoft Excel row append failed: ${await appendRes.text()}`);
    }
    action = 'create';
    console.log(`✅ [EXCEL sync] appended new customer row at A${nextRowNumber} for ${phone}`);
  }

  const latencyMs = Date.now() - t0;
  return { action, latencyMs };
}
