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
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

const COLUMNS = [
  'Name', 'Phone', 'Email', 'Status', 'Score',
  'Source', 'Enquiry Type', 'Tags', 'Created At', 'Last Message At',
];

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Wrap in quotes if contains comma, newline, or quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toRow(lead: Record<string, unknown>): string {
  return [
    lead.name,
    lead.phone,
    lead.email,
    lead.lead_status,
    lead.lead_score,
    lead.source,
    lead.enquiry_type,
    Array.isArray(lead.tags) ? (lead.tags as string[]).join('; ') : (lead.tags ?? ''),
    lead.created_at   ? new Date(lead.created_at as string).toISOString()   : '',
    lead.last_message_at ? new Date(lead.last_message_at as string).toISOString() : '',
  ].map(escapeCSV).join(',');
}

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const from   = searchParams.get('from');
  const to     = searchParams.get('to');

  let query = supabaseAdmin
    .from('leads')
    .select('name, phone, email, lead_status, lead_score, source, enquiry_type, tags, created_at, last_message_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (status)  query = query.eq('lead_status', status);
  if (from)    query = query.gte('created_at', `${from}T00:00:00Z`);
  if (to)      query = query.lte('created_at', `${to}T23:59:59Z`);

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows   = [COLUMNS.join(','), ...(leads ?? []).map(toRow)];
  const csv    = rows.join('\r\n');
  const date   = new Date().toISOString().slice(0, 10);
  const filename = `leads_${date}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
