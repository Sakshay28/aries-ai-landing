// ═══════════════════════════════════════════════════════════
// 🗑️ GDPR Deletion Processor — runs nightly
// Processes data_deletion_requests that have passed their
// 30-day grace period.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find all pending requests whose grace period has passed
  const { data: dueRequests } = await supabaseAdmin
    .from('data_deletion_requests')
    .select('id, tenant_id, email, confirmation_code')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString());

  if (!dueRequests || dueRequests.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let processed = 0;

  for (const request of dueRequests) {
    try {
      // Mark as processing
      await supabaseAdmin
        .from('data_deletion_requests')
        .update({ status: 'processing' })
        .eq('id', request.id);

      const tenantId = request.tenant_id as string;

      if (tenantId) {
        // Delete in dependency order (child tables first)
        const tables = [
          'broadcast_optouts',
          'data_deletion_requests',  // delete OTHER requests for this tenant
          'follow_ups',
          'analytics_events',
          'audit_logs',
          'messages',
          'conversations',
          'restaurant_bookings',
          'bookings',
          'leads',
          'broadcast_deliveries',
          'broadcast_queue',
          'broadcast_analytics',
          'broadcast_campaigns',
          'broadcast_audiences',
          'broadcast_automation_rules',
          'knowledge_docs',
          'agent_configs',
          'smart_rules',
          'automation_flows',
          'tenant_integrations',
          'users',
        ];

        for (const table of tables) {
          const colName = table === 'users' ? 'tenant_id' :
                          table === 'restaurant_bookings' ? 'restaurant_id' : 'tenant_id';
          try {
            await (supabaseAdmin.from(table) as any)
              .delete()
              .eq(colName, tenantId);
          } catch (tableErr) {
            console.warn(`⚠️ Deletion: table ${table} skipped (may not exist):`, tableErr);
          }
        }

        // Finally delete the tenant itself
        await supabaseAdmin.from('tenants').delete().eq('id', tenantId);
        console.log(`✅ Fully deleted tenant ${tenantId} (GDPR/DPDP)`);
      }

      // Mark this request as completed
      await supabaseAdmin
        .from('data_deletion_requests')
        .update({ status: 'completed', processed_at: new Date().toISOString() })
        .eq('id', request.id);

      processed++;
    } catch (e) {
      console.error(`❌ Failed to process deletion for request ${request.id}:`, e);
      // Revert to pending so it retries tomorrow
      await supabaseAdmin
        .from('data_deletion_requests')
        .update({ status: 'pending' })
        .eq('id', request.id);
    }
  }

  return NextResponse.json({ ok: true, processed });
}
