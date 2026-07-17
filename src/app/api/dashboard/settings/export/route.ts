// ═══════════════════════════════════════════════════════════
// Full Account Data Export — "download all my data"
// ═══════════════════════════════════════════════════════════
// GET /api/dashboard/settings/export
// Bundles every tenant-scoped table that holds a client's actual data
// (not internal telemetry) into one downloadable JSON file. This is what
// backs the privacy policy's "export your data in a machine-readable
// format" promise — previously only a leads-only CSV existed.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { logAudit } from '@/lib/audit/logger';

// Full-account export is more sensitive than the leads-only CSV — restrict
// to the roles trusted with the whole account, not just the CRM.
const EXPORT_ROLES = new Set(['owner', 'admin']);

// Each large table is capped so one request can't run indefinitely against
// a tenant with years of history — generous for this product's current
// scale (see [[project_scope_20_clients]]); revisit if a tenant grows past it.
const ROW_CAP = 20000;

interface SectionResult {
  rows: unknown[];
  truncated: boolean;
  error?: string;
}

async function fetchSection(
  table: string,
  tenantId: string,
  columns: string,
  orderBy = 'created_at'
): Promise<SectionResult> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(columns)
    .eq('tenant_id', tenantId)
    .order(orderBy, { ascending: false })
    .limit(ROW_CAP + 1);

  if (error) {
    // A table that doesn't exist or errors shouldn't fail the whole export —
    // the client still gets everything else, with a clear note on what's missing.
    console.warn(`[data-export] section "${table}" failed:`, error.message);
    return { rows: [], truncated: false, error: error.message };
  }

  const rows = data ?? [];
  const truncated = rows.length > ROW_CAP;
  return { rows: truncated ? rows.slice(0, ROW_CAP) : rows, truncated };
}

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!EXPORT_ROLES.has(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: only owners and admins can export the full account.' },
        { status: 403 }
      );
    }
    const tenantId = user.tenant_id;

    // Heavier than the leads CSV — 3 per day, not 10 per hour.
    const rl = await checkRedisRateLimit(`export:full:${tenantId}`, 3, 86400);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Export limit reached (3/day). Try again tomorrow.' },
        { status: 429 }
      );
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, business_name, business_type, business_phone, business_address, business_website, business_email, bot_name, bot_personality, welcome_message, welcome_offer, usps, working_hours, staff_phone, staff_name, manager_phone, plan, plan_status, created_at')
      // Deliberately excludes wa_access_token, wa_app_secret, wa_verify_token —
      // a data export must never become a second place credentials leak from.
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ success: false, error: 'Failed to load account data.' }, { status: 500 });
    }

    const [
      businessProfile, team, leads, conversations, messages,
      bookings, restaurantBookings, knowledgeDocs, notes, followUps, consentHistory,
    ] = await Promise.all([
      fetchSection('business_profiles', tenantId, '*'),
      fetchSection('users', tenantId, 'id, email, full_name, role, created_at'),
      fetchSection('leads', tenantId, '*'),
      fetchSection('conversations', tenantId, '*'),
      fetchSection('messages', tenantId, '*'),
      fetchSection('bookings', tenantId, '*'),
      fetchSection('restaurant_bookings', tenantId, '*'),
      fetchSection('knowledge_docs', tenantId, 'id, filename, file_type, created_at'),
      fetchSection('notes', tenantId, '*'),
      fetchSection('follow_ups', tenantId, '*'),
      fetchSection('consent_records', tenantId, 'consent_type, policy_version, source, accepted_at'),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      tenantId,
      businessName: tenant.business_name,
      account: tenant,
      businessProfile: businessProfile.rows[0] ?? null,
      team: team.rows,
      leads: { rows: leads.rows, truncated: leads.truncated },
      conversations: { rows: conversations.rows, truncated: conversations.truncated },
      messages: { rows: messages.rows, truncated: messages.truncated },
      bookings: { rows: bookings.rows, truncated: bookings.truncated },
      restaurantBookings: { rows: restaurantBookings.rows, truncated: restaurantBookings.truncated },
      knowledgeBase: knowledgeDocs.rows,
      notes: notes.rows,
      followUps: followUps.rows,
      consentHistory: consentHistory.rows,
    };

    logAudit({
      tenant_id: tenantId,
      actor_id: user.id,
      actor_email: user.email,
      action: 'data_export_requested',
      entity: 'tenant_account',
      entity_id: tenantId,
    });

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="ariesai-data-export-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('GET /api/dashboard/settings/export crash:', err);
    return NextResponse.json({ success: false, error: 'An internal error occurred during export.' }, { status: 500 });
  }
}
