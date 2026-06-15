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

    // ── Batch-fetch latest message per RAW conversation (for previews) ────────
    // Fetched BEFORE collapsing so the collapse can prefer the thread that actually
    // carries history. The cap keeps the payload bounded; on a very high-volume tenant
    // an old low-traffic thread may fall outside the window and show no preview, but it
    // still appears in the list and opens with full history.
    const rawConvIds = rawConvos.map((c: any) => c.id);
    const lastMsgMap: Record<string, { preview: string; at: string }> = {};
    const { data: previewMsgs } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, content, created_at, message_type, media_caption')
      .in('conversation_id', rawConvIds)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(2000);

    const MEDIA_LABELS: Record<string, string> = {
      image: '📷 Photo', video: '🎥 Video', audio: '🎵 Audio',
      voice: '🎵 Voice message', document: '📄 Document', sticker: '💟 Sticker',
    };
    // Legacy rows stored a raw placeholder token instead of the delivered copy —
    // never surface it in the inbox preview.
    const sanitizePreview = (content: string | null): string => {
      if (content && /^\[follow_up_template:.+\]$/i.test(content)) return 'Follow-up reminder sent';
      return content ?? '';
    };
    for (const msg of previewMsgs ?? []) {
      if (!lastMsgMap[msg.conversation_id]) {
        const mediaLabel = MEDIA_LABELS[msg.message_type as string];
        const preview = mediaLabel
          ? (msg.media_caption ? `${mediaLabel} · ${msg.media_caption}` : mediaLabel)
          : sanitizePreview(msg.content);
        lastMsgMap[msg.conversation_id] = { preview, at: msg.created_at };
      }
    }

    // ── Collapse to one thread per contact ────────────────────────────────────
    // Key on the DIGITS-ONLY phone so "+91…" and "91…" variants of the same contact
    // never split into two inbox rows. Within a contact group, prefer the thread that
    // actually has messages (most-recent real message wins) so an empty husk created by
    // a past race can never hide the canonical history. Falls back to last_message_at
    // when no thread has messages yet.
    const normKey = (c: any) => (c.sender_id || '').replace(/\D/g, '') || c.id;
    const bestByContact = new Map<string, any>();
    for (const c of rawConvos as any[]) {
      const key = normKey(c);
      const incumbent = bestByContact.get(key);
      if (!incumbent) { bestByContact.set(key, c); continue; }
      const cAt = lastMsgMap[c.id]?.at;
      const iAt = lastMsgMap[incumbent.id]?.at;
      // A thread with messages always beats one without; otherwise newest activity wins.
      const cRank = cAt ?? c.last_message_at ?? '';
      const iRank = iAt ?? incumbent.last_message_at ?? '';
      const cHasMsgs = !!cAt, iHasMsgs = !!iAt;
      const cWins = (cHasMsgs !== iHasMsgs) ? cHasMsgs : cRank > iRank;
      if (cWins) bestByContact.set(key, c);
    }
    const convos = Array.from(bestByContact.values()).slice(0, 100);

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
