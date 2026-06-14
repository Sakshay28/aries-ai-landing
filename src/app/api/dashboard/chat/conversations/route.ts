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

    // IMPORTANT: do NOT filter on is_active here.
    // The nightly cron (/api/cron/timeout → processStaleConversations) flips every
    // conversation with no message in the last 24h to is_active=false. Filtering the
    // inbox on is_active therefore made entire chat histories vanish after one quiet
    // day. We keep every conversation visible and de-duplicate by contact below so the
    // empty merge-duplicate rows (0 messages) don't clutter the list.
    const { data: rawConvos, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, last_message_at, is_active, bot_paused, sender_id, lead_id, escalated')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(300);  // fetch wide; collapsed to one thread per contact (≤100) below

    if (convErr) {
      console.error('Conversations fetch error:', convErr);
      return NextResponse.json({ success: false, error: convErr.message }, { status: 500 });
    }

    if (!rawConvos || rawConvos.length === 0) {
      return NextResponse.json({ success: true, conversations: [], tenantId, me: { id: me.id } });
    }

    // ── Collapse to one thread per contact ────────────────────────────────────
    // Rows are already sorted newest-first, so the first time we see a sender_id is
    // its freshest (canonical) thread — which is also the row that carries the merged
    // message history. Older empty duplicates for the same contact drop out.
    const seenSender = new Set<string>();
    const convos = rawConvos
      .filter((c: any) => {
        const key = c.sender_id || c.id;
        if (seenSender.has(key)) return false;
        seenSender.add(key);
        return true;
      })
      .slice(0, 100);

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

    // ── Batch-fetch latest message per conversation (for previews) ────────────
    // Scoped to the displayed conversations. The cap keeps the payload bounded; on a
    // very high-volume tenant an old low-traffic thread may fall outside the window
    // and show no preview, but it still appears in the list and opens with full history.
    const lastMsgMap: Record<string, { preview: string; at: string }> = {};
    const { data: previewMsgs } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, content, created_at, message_type, media_caption')
      .in('conversation_id', convIds)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1000);

    const MEDIA_LABELS: Record<string, string> = {
      image: '📷 Photo', video: '🎥 Video', audio: '🎵 Audio',
      voice: '🎵 Voice message', document: '📄 Document', sticker: '💟 Sticker',
    };
    for (const msg of previewMsgs ?? []) {
      if (!lastMsgMap[msg.conversation_id]) {
        const mediaLabel = MEDIA_LABELS[msg.message_type as string];
        const preview = mediaLabel
          ? (msg.media_caption ? `${mediaLabel} · ${msg.media_caption}` : mediaLabel)
          : msg.content;
        lastMsgMap[msg.conversation_id] = { preview, at: msg.created_at };
      }
    }

    // ── Assemble final response ──────────────────────────────────────────────
    const enriched = convos.map((c: any) => {
      const lead = leadsMap[c.lead_id] ?? { name: null, phone: c.sender_id ?? null, assigned_to: null };
      const lastMsg = lastMsgMap[c.id];
      // Trust the newest message timestamp over the conversation column when newer
      const effectiveAt = lastMsg && (!c.last_message_at || lastMsg.at > c.last_message_at)
        ? lastMsg.at
        : c.last_message_at;
      return {
        ...c,
        last_message_at: effectiveAt,
        leads: lead,
        assigned_to: lead.assigned_to ?? null,
        last_message_preview: lastMsg?.preview ?? null,
      };
    });

    // Re-sort by the healed timestamps so the freshest conversation is on top
    enriched.sort((a: any, b: any) =>
      (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));

    return NextResponse.json({ success: true, conversations: enriched, tenantId, me: { id: me.id } });
  } catch (error: any) {
    console.error('Conversations error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
