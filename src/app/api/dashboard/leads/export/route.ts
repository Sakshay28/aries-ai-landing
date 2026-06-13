// ═══════════════════════════════════════════════════════════
// Lead Export — CSV download
// ═══════════════════════════════════════════════════════════
// GET /api/dashboard/leads/export
// Streams all leads for the tenant as a CSV file download.
// Optional query params:
//   ?status=hot     — filter by lead_status
//   ?from=2026-01-01 — filter by created_at date range
//   ?to=2026-12-31
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';

// Bulk CRM export is a privileged action — restrict to roles that are
// trusted with the full contact list. Staff/viewer can work leads in the
// UI but cannot exfiltrate the entire database as a CSV.
const EXPORT_ROLES = new Set(['owner', 'admin', 'manager']);

const COLUMNS = [
  'Name', 'Phone', 'Email', 'Status', 'Score',
  'Source', 'Notes', 'Created At', 'Last Message At',
];

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Strip formula injection prefixes — Excel/LibreOffice execute these as formulas
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Wrap in quotes if contains comma, newline, or quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toRow(lead: Record<string, unknown>): string {
  // Safe fallback mapping to protect against schema drift
  const source = lead.source ?? lead.channel ?? 'manual';
  return [
    lead.name ?? '',
    lead.phone ?? '',
    lead.email ?? '',
    lead.lead_status ?? '',
    lead.lead_score ?? 0,
    source,
    lead.notes ?? '',
    lead.created_at ? new Date(lead.created_at as string).toISOString() : '',
    lead.last_message_at ? new Date(lead.last_message_at as string).toISOString() : '',
  ].map(escapeCSV).join(',');
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, message: 'Unauthorized access.' }, { status: 401 });
    }
    if (!EXPORT_ROLES.has(user.role)) {
      return NextResponse.json({ success: false, message: 'Forbidden: insufficient permissions to export contacts.' }, { status: 403 });
    }
    const tenantId = user.tenant_id;

    // Rate-limit bulk exports: 10 per tenant per hour.
    // Without this, a privileged user (or compromised account) can loop-call this
    // endpoint and repeatedly download the entire CRM. Each call scans the full table.
    const rl = await checkRedisRateLimit(`export:leads:${tenantId}`, 10, 3600);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: 'Export rate limit reached (10/hour). Try again later.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const from   = searchParams.get('from');
    const to     = searchParams.get('to');

    // Query only existing columns in Postgres to prevent SQL failure
    let query = supabaseAdmin
      .from('leads')
      .select('name, phone, email, lead_status, lead_score, channel, notes, created_at, last_message_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (status)  query = query.eq('lead_status', status);
    if (from)    query = query.gte('created_at', `${from}T00:00:00Z`);
    if (to)      query = query.lte('created_at', `${to}T23:59:59Z`);

    const { data: leads, error } = await query;
    if (error) {
      console.error('GET /api/dashboard/leads/export error:', error);
      return NextResponse.json({ success: false, message: 'Failed to query contacts for export.' }, { status: 500 });
    }

    // Standardize empty states
    if (!leads || leads.length === 0) {
      // Return a UTF-8 CSV with headers only
      const csv = '\uFEFF' + COLUMNS.join(',');
      const date = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="contacts_empty_${date}.csv"`,
          'Cache-Control':       'no-store',
        },
      });
    }

    // Construct CSV with UTF-8 BOM to prevent excel character breaking
    const rows = [COLUMNS.join(','), ...(leads ?? []).map(toRow)];
    const csv = '\uFEFF' + rows.join('\r\n');
    const date = new Date().toISOString().slice(0, 10);
    const filename = `contacts_export_${date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (err: any) {
    console.error('GET /api/dashboard/leads/export crash:', err);
    return NextResponse.json({ success: false, message: 'An internal error occurred during contact export.' }, { status: 500 });
  }
}
