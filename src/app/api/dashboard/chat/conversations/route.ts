import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { selectInBatches } from '@/lib/supabase/select-in-batches';
import { notifyAdmin } from '@/lib/alerts/admin';

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

    // ── Batch-fetch leads ─────────────────────────────────────────────────────
    // CRITICAL: a single `.in('id', leadIds)` fails with HTTP 400 once the id list
    // exceeds ~300 (the id=in.(…) filter overflows the request URL). supabase-js
    // then returns { data: null } and, if we swallow it, EVERY conversation is
    // enriched with assigned_to=null — which silently broke "Assigned to me" for
    // every tenant with 300+ contacts (2026-07-27 RCA). Chunk the lookup and fail
    // loudly instead of returning a hole. See src/lib/supabase/select-in-batches.ts.
    const leadIds = [...new Set(convos.map((c: any) => c.lead_id).filter(Boolean))] as string[];
    const leadsMap: Record<string, { name: string | null; phone: string | null; assigned_to: string | null }> = {};
    if (leadIds.length > 0) {
      let leads: Array<{ id: string; name: string | null; phone: string | null; assigned_to: string | null }>;
      try {
        leads = await selectInBatches(leadIds, (batch) =>
          supabaseAdmin.from('leads').select('id, name, phone, assigned_to').in('id', batch)
        );
      } catch (e: any) {
        // Do NOT return conversations with all-null assignments (the old silent bug).
        // Surface loudly so the sidebar shows a retry banner instead of a wrong,
        // empty "Assigned to me".
        console.error('Conversations: lead enrichment failed:', e?.message);
        notifyAdmin({
          dedupeKey: `chat-conversations-lead-enrich-${tenantId}`,
          subject: 'Chat inbox: lead assignment enrichment failed',
          summary: `GET /api/dashboard/chat/conversations could not batch-load ${leadIds.length} leads for tenant ${tenantId}. "Assigned to me" would be wrong; request failed instead.`,
          context: { tenantId, leadCount: leadIds.length, error: e?.message },
        }).catch(() => {});
        return NextResponse.json({ success: false, error: 'Failed to load assignments' }, { status: 500 });
      }
      leads.forEach((l) => {
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
