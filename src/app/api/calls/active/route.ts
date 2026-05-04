import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantFromCookies } from '@/lib/auth/getTenantFromCookies';

// ───────────────────────────────────────────────────────────────────────
// GET /api/calls/active — currently active calls for this tenant
// Filtered server-side by tenant_id; defence-in-depth on top of RLS.
// ───────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const ctx = await getTenantFromCookies();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: activeCalls } = await supabaseAdmin
      .from('active_calls')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    return NextResponse.json({ active_calls: activeCalls || [] });
  } catch (error) {
    console.error('❌ GET /api/calls/active error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
