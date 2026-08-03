import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

// Ultra-light change-probe for the chat sidebar's fallback poll.
// Returns only { count, maxTs } — the exact tenant-wide conversation count plus
// the newest last_message_at — computed in Postgres so a single row (+ count
// header) leaves the DB instead of the full ~2000-row conversation list.
//
// The sidebar polls THIS every 20s and only re-fetches the heavy
// /api/dashboard/chat/conversations list when (count, maxTs) actually changes.
// This is a fallback gate: live state changes (new message, bot_paused,
// escalation, re-assignment) are delivered by Realtime and by the leads/
// conversations subscriptions; the poll exists to catch anything Realtime
// dropped, and a new/changed message always moves (count, maxTs).
//
// Before this, the 20s poll transferred the whole list every time — the single
// biggest Supabase egress driver (see DB_USAGE_AUDIT_2026-07-27.md / the
// 2026-07-02 usage investigation). Egress per idle poll: ~350KB → ~200 bytes.
export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data, error, count } = await supabaseAdmin
      .from('conversations')
      .select('last_message_at', { count: 'exact' })
      .eq('tenant_id', me.tenant_id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      // Surface as a soft failure — the sidebar falls back to a full load on any
      // non-success digest, so a probe error never leaves the inbox stale.
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: count ?? 0,
      maxTs: (data?.[0] as { last_message_at: string | null } | undefined)?.last_message_at ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'digest failed' },
      { status: 500 },
    );
  }
}
