import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // 1. Fetch integration config
    const { data: integration, error: intError } = await supabaseAdmin
      .from('tenant_integrations')
      .select('config, is_active, connected_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'google_sheets')
      .maybeSingle();

    if (intError) throw intError;

    if (!integration || !integration.is_active) {
      return NextResponse.json({
        connected: false,
        stats: {
          connectionStatus: 'Disconnected',
          connectedEmail: '',
          spreadsheetId: '',
          spreadsheetName: '',
          sheetName: '',
          lastSync: '',
          lastSuccess: '',
          lastFailed: '',
          createdToday: 0,
          updatedToday: 0,
          failedToday: 0,
          retryQueueCount: 0,
          syncHealth: 100,
          averageLatency: 0,
        },
        auditLogs: [],
      });
    }

    const cfg = integration.config as any;
    const spreadsheetId = cfg.spreadsheet_id || '';
    const sheetName = cfg.sheet_name || 'Leads';
    const connectedEmail = cfg.connected_email || '';

    // Storage parameters validation
    const validationErrors: string[] = [];
    if (!cfg.access_token) validationErrors.push('Missing Access Token');
    if (!cfg.refresh_token) validationErrors.push('Missing Refresh Token');
    if (!cfg.expires_at) validationErrors.push('Missing Expiration Time');
    if (!cfg.spreadsheet_id) validationErrors.push('Missing Spreadsheet ID');
    if (!cfg.connected_email) validationErrors.push('Missing Google Email');

    let connectionStatus = 'Connected';
    let authError = cfg.auth_error || '';

    if (validationErrors.length > 0) {
      connectionStatus = 'Authentication Required';
      authError = `Storage Validation Failed: ${validationErrors.join(', ')}. Please reconnect.`;
    } else if (cfg.auth_error) {
      connectionStatus = 'Authentication Required';
    }

    // 2. Fetch live spreadsheet name from Google Sheets API
    let spreadsheetName = 'Aries CRM Mirror';
    try {
      const accessToken = decryptToken(cfg.access_token);
      if (accessToken) {
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (metaRes.ok) {
          const meta = await metaRes.json() as any;
          if (meta.properties?.title) {
            spreadsheetName = meta.properties.title;
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ [GSHEETS stats] failed to fetch sheet name live:', e);
    }

    // 3. Compute stats from database (today's counts, latencies, retry queue size)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    // Rows created today
    const { count: createdToday } = await supabaseAdmin
      .from('google_sheets_audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'success')
      .eq('details->>action', 'create')
      .gte('created_at', todayIso);

    // Rows updated today
    const { count: updatedToday } = await supabaseAdmin
      .from('google_sheets_audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'success')
      .eq('details->>action', 'update')
      .gte('created_at', todayIso);

    // Rows failed today
    const { count: failedToday } = await supabaseAdmin
      .from('google_sheets_audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'failed')
      .gte('created_at', todayIso);

    // Queue size (failed or pending retries)
    const { count: retryQueueCount } = await supabaseAdmin
      .from('google_sheets_sync_queue')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    // Latency & Health over last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentLogs } = await supabaseAdmin
      .from('google_sheets_audit_logs')
      .select('status, latency_ms')
      .eq('tenant_id', tenantId)
      .gte('created_at', oneDayAgo);

    let syncHealth = 100;
    let averageLatency = 0;

    if (recentLogs && recentLogs.length > 0) {
      const successCount = recentLogs.filter(l => l.status === 'success').length;
      syncHealth = Math.round((successCount / recentLogs.length) * 100);

      const latencies = recentLogs.filter(l => l.status === 'success' && l.latency_ms).map(l => l.latency_ms);
      if (latencies.length > 0) {
        averageLatency = Math.round(latencies.reduce((sum, val) => sum + val, 0) / latencies.length);
      }
    }

    // Last Sync timestamps
    const { data: lastSuccessRow } = await supabaseAdmin
      .from('google_sheets_audit_logs')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastFailedRow } = await supabaseAdmin
      .from('google_sheets_audit_logs')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastSync = lastSuccessRow?.created_at || '';
    const lastSuccess = lastSuccessRow?.created_at || '';
    const lastFailed = lastFailedRow?.created_at || '';

    // 4. Fetch last 50 audit logs
    const { data: auditLogs } = await supabaseAdmin
      .from('google_sheets_audit_logs')
      .select('id, phone, event_type, status, error_message, latency_ms, details, created_at, lead:lead_id(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      connected: true,
      stats: {
        connectionStatus,
        authError,
        connectedEmail,
        spreadsheetId,
        spreadsheetName,
        sheetName,
        lastSync,
        lastSuccess,
        lastFailed,
        createdToday: createdToday || 0,
        updatedToday: updatedToday || 0,
        failedToday: failedToday || 0,
        retryQueueCount: retryQueueCount || 0,
        syncHealth,
        averageLatency: averageLatency / 1000, // ms to seconds
      },
      auditLogs: auditLogs || [],
    });
  } catch (err: any) {
    console.error('❌ [GSHEETS stats api] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
