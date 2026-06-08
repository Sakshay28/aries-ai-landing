// ═══════════════════════════════════════════════════════════
// 🔄 Playground Reset — Clear All Server-Side Session State
// ═══════════════════════════════════════════════════════════
// Called when user clicks "Reset Conversation" in the simulator.
// Flushes all AI-related caches so the very next message uses
// the freshest published configuration — zero stale context.
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { invalidateTenantAllCaches } from '@/lib/tenant/manager';

export async function DELETE() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Flush ALL tenant caches: tenant config, RAG results, prompt cache, app secrets.
    // This guarantees the next playground message picks up the latest published config.
    await invalidateTenantAllCaches(tenantId);

    console.log(`🔄 Playground reset: all caches flushed for tenant ${tenantId}`);

    return NextResponse.json({
      success: true,
      message: 'Simulator session cleared. All AI context flushed.',
    });
  } catch (err) {
    console.error('❌ Playground reset error:', err);
    return NextResponse.json({ success: false, error: 'Failed to reset session' }, { status: 500 });
  }
}
