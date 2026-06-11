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
    // Fetch with a hard cap so the query never returns 50k+ rows.
    // The newest row per conversation also provides the authoritative timestamp —
    // conversations.last_message_at can lag (it's updated separately in the
    // webhook), so we self-heal stale values from the messages table here.
    const lastMsgMap: Record<string, { preview: string; at: string }> = {};
    const { data: previewMsgs } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, content, created_at, message_type, media_caption')
      .in('conversation_id', convIds)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(Math.min(convIds.length * 3, 300));

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
