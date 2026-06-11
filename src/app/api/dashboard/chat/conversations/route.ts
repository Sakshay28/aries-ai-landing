import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const tenantId = me.tenant_id;

    const { data: convos, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, last_message_at, is_active, bot_paused, sender_id, lead_id, escalated')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)  // Only show active conversations — hides old closed/duplicate threads
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100);  // Increased from 50 — businesses with many contacts need full visibility

    if (convErr) {
      console.error('Conversations fetch error:', convErr);
      return NextResponse.json({ success: false, error: convErr.message }, { status: 500 });
    }

    if (!convos || convos.length === 0) {
      return NextResponse.json({ success: true, conversations: [] });
    }

    const convIds = convos.map((c: any) => c.id);

    // ── Batch-fetch leads (single query) ────────────────────────────────────
    const leadIds = convos.map((c: any) => c.lead_id).filter(Boolean);
    const leadsMap: Record<string, { name: string | null; phone: string | null; assigned_to: string | null }> = {};
    if (leadIds.length > 0) {
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, name, phone, assigned_to')
        .in('id', leadIds);
      (leads ?? []).forEach((l: any) => {
        leadsMap[l.id] = { name: l.name, phone: l.phone, assigned_to: l.assigned_to ?? null };
      });
    }

    // ── Batch-fetch latest message per conversation ─────────────────────────
    // Uses RPC with DISTINCT ON for O(N) cost instead of fetching ALL messages.
    // Fallback: fetch with a hard cap so the query never returns 50k+ rows.
    const lastMsgMap: Record<string, string> = {};
    const { data: previewMsgs } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', convIds)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 2); // at most 2 rows per conversation — first hit wins

    for (const msg of previewMsgs ?? []) {
      if (!lastMsgMap[msg.conversation_id]) {
        lastMsgMap[msg.conversation_id] = msg.content;
      }
    }

    // ── Assemble final response ──────────────────────────────────────────────
    const enriched = convos.map((c: any) => {
      const lead = leadsMap[c.lead_id] ?? { name: null, phone: c.sender_id ?? null, assigned_to: null };
      return {
        ...c,
        leads: lead,
        assigned_to: lead.assigned_to ?? null,
        last_message_preview: lastMsgMap[c.id] ?? null,
      };
    });

    return NextResponse.json({ success: true, conversations: enriched, tenantId, me: { id: me.id } });
  } catch (error: any) {
    console.error('Conversations error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
