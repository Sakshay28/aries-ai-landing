import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantFromCookies } from '@/lib/auth/getTenantFromCookies';

// ── GET /api/calls — list call logs for the authenticated tenant ──────────────
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantFromCookies();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 200);

    const { data: callLogs } = await supabaseAdmin
      .from('call_logs')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return NextResponse.json({ calls: callLogs || [] });
  } catch (error) {
    console.error('❌ GET /api/calls error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
