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
    // last_message_preview/last_message_type/last_message_at are trigger-maintained
    // (see 20260714_chat_sidebar_perf.sql) — no second query over the messages table
    // needed anymore. This used to also fetch up to 5000 messages tenant-wide on every
    // call (every 20s poll + every realtime event tenant-wide), which was the dominant
    // cost behind the dashboard chat lag.
    const { data: rawConvos, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, last_message_at, is_active, bot_paused, sender_id, lead_id, escalated, message_count, last_message_preview, last_message_type')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(2000); // fetch wide; collapsed to one thread per contact below

    if (convErr) {
      console.error('Conversations fetch error:', convErr);
      return NextResponse.json({ success: false, error: convErr.message }, { status: 500 });
    }

    if (!rawConvos || rawConvos.length === 0) {
      return NextResponse.json({ success: true, conversations: [], tenantId, me: { id: me.id } });
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
      // A thread with messages always beats one without; otherwise newest activity wins.
      const cHasMsgs = (c.message_count ?? 0) > 0, iHasMsgs = (incumbent.message_count ?? 0) > 0;
      const cRank = c.last_message_at ?? '';
      const iRank = incumbent.last_message_at ?? '';
      const cWins = (cHasMsgs !== iHasMsgs) ? cHasMsgs : cRank > iRank;
      if (cWins) bestByContact.set(key, c);
    }
    const convos = Array.from(bestByContact.values());

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
    // last_message_at is now trigger-guaranteed fresh (GREATEST, see migration), so
    // no JS-side healing against a separate message fetch is needed anymore.
    const enriched = convos.map((c: any) => {
      const lead = leadsMap[c.lead_id] ?? { name: null, phone: c.sender_id ?? null, assigned_to: null };
      return {
        ...c,
        leads: lead,
        assigned_to: lead.assigned_to ?? null,
      };
    });

    enriched.sort((a: any, b: any) =>
      (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));

    return NextResponse.json({ success: true, conversations: enriched, tenantId, me: { id: me.id } });
  } catch (error: any) {
    console.error('Conversations error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
