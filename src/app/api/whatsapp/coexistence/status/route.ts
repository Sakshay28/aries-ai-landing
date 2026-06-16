// ═══════════════════════════════════════════════════════════
// 🤝 Coexistence status — wa_mode + history-import progress
// ═══════════════════════════════════════════════════════════
// Read-only. Powers the Settings → WhatsApp tab: shows whether the number is in
// coexistence mode and how far the 6-month history backfill has progressed.
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Both reads tolerate the pre-migration state (columns/table absent) and
  // simply report Cloud-API mode with no history yet.
  const [tenantRes, chunksRes] = await Promise.all([
    supabaseAdmin
      .from('tenants')
      .select('wa_mode, coexistence_connected_at')
      .eq('id', tenantId)
      .maybeSingle()
      .then(r => r, () => ({ data: null })),
    supabaseAdmin
      .from('coexistence_history_sync')
      .select('progress, status, messages_imported, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .then(r => r, () => ({ data: null })),
  ]);
  const tenant = (tenantRes as { data: unknown }).data;
  const chunks = (chunksRes as { data: unknown }).data;

  const rows = (chunks as Array<{ progress: string | null; status: string; messages_imported: number }>) || [];
  const totalImported = rows.reduce((sum, r) => sum + (r.messages_imported || 0), 0);
  const maxProgress = rows.reduce((max, r) => {
    const p = r.progress != null ? parseInt(r.progress) : 0;
    return Number.isFinite(p) && p > max ? p : max;
  }, 0);
  // `progress` is cumulative across the whole sync, so only the FINAL chunk
  // reaches 100 — key completion off the highest progress we've seen, not off
  // every chunk's status (earlier chunks stay 'in_progress' by design).
  const completed = rows.length > 0 && maxProgress >= 100;

  return NextResponse.json({
    wa_mode: (tenant as { wa_mode?: string } | null)?.wa_mode ?? 'cloud_api',
    connected_at: (tenant as { coexistence_connected_at?: string } | null)?.coexistence_connected_at ?? null,
    history: {
      chunks_received: rows.length,
      messages_imported: totalImported,
      progress: maxProgress,
      status: rows.length === 0 ? 'pending' : completed ? 'completed' : 'in_progress',
    },
  });
}
