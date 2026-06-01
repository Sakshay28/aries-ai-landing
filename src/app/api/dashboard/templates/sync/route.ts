import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getMetaTemplateStatus } from '@/lib/meta/templates';

// ── POST: Sync approval status for all pending templates ──
// Call this on page load and every 30s while PENDING templates exist.
export async function POST() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const apiKey = decryptToken(tenant.wa_access_token as string);
    if (!apiKey) return NextResponse.json({ success: true, updated: 0 });

    // Fetch all templates that could have changed status
    const { data: pending } = await supabaseAdmin
      .from('draft_templates')
      .select('id, meta_template_id, status')
      .eq('tenant_id', tenantId)
      .in('status', ['PENDING', 'APPROVED', 'PAUSED'])
      .not('meta_template_id', 'is', null);

    if (!pending || pending.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    let updated = 0;

    // Check each template status concurrently (cap at 10 concurrent)
    const BATCH_SIZE = 10;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (t) => {
          if (!t.meta_template_id) return;
          const result = await getMetaTemplateStatus(apiKey, t.meta_template_id as string);
          if (!result) return;

          const newStatus = result.status.toUpperCase();
          if (newStatus !== (t.status as string).toUpperCase()) {
            const updateData: Record<string, unknown> = {
              status: newStatus,
              updated_at: new Date().toISOString(),
            };
            if (newStatus === 'APPROVED') {
              updateData.approved_at = new Date().toISOString();
            }
            if (result.rejectedReason) {
              updateData.rejection_reason = result.rejectedReason;
            }

            await supabaseAdmin
              .from('draft_templates')
              .update(updateData)
              .eq('id', t.id)
              .eq('tenant_id', tenantId);

            updated++;
          }
        })
      );
    }

    return NextResponse.json({ success: true, updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/dashboard/templates/sync error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
