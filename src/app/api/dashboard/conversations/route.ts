// ═══════════════════════════════════════════════════════════
// 💬 Conversations API — Dashboard Data
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const activeOnly = searchParams.get('active') !== 'false';

  try {
    let query = supabaseAdmin
      .from('conversations')
      .select('id, sender_name, sender_id, current_step, is_active, escalated, last_message_at, channel, message_count')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    const rows = data || [];

    // Batch-fetch last message per conversation (one query, no N+1)
    if (rows.length > 0) {
      const convIds = rows.map((c: { id: string }) => c.id);
      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false });

      // Internal tokens must never leak into the preview text.
      const sanitize = (content: string | null): string | null => {
        if (content === '__DELETED__') return 'You deleted this message';
        if (content && /^\[follow_up_template:.+\]$/i.test(content)) return 'Follow-up reminder sent';
        return content;
      };
      const lastMsgMap: Record<string, string | null> = {};
      for (const msg of (msgs || [])) {
        if (!(msg.conversation_id in lastMsgMap)) {
          lastMsgMap[msg.conversation_id] = sanitize(msg.content);
        }
      }

      const enriched = rows.map((c: Record<string, unknown>) => ({ ...c, last_message_text: lastMsgMap[c.id as string] ?? null }));
      return NextResponse.json({ success: true, data: enriched });
    }

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('❌ Conversations fetch error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch conversations' }, { status: 500 });
  }
}
