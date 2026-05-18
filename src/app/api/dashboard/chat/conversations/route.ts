import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: convos, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, last_message_at, is_active, bot_paused, sender_id, lead_id")
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (convErr) {
      console.error('Conversations fetch error:', convErr);
      return NextResponse.json({ success: false, error: convErr.message }, { status: 500 });
    }

    if (!convos) {
      return NextResponse.json({ success: true, conversations: [] });
    }

    // Bulk-fetch leads for all conversations in one query
    const leadIds = convos.map((c: any) => c.lead_id).filter(Boolean);
    let leadsMap: Record<string, { name: string | null; phone: string | null }> = {};
    if (leadIds.length > 0) {
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, name, phone')
        .in('id', leadIds);
      (leads ?? []).forEach((l: any) => { leadsMap[l.id] = { name: l.name, phone: l.phone }; });
    }

    // Fetch latest message preview for each conversation
    const withPreviews = await Promise.all(
      convos.map(async (c: any) => {
        const { data: msgs } = await supabaseAdmin
          .from("messages")
          .select("content")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const lead = leadsMap[c.lead_id] ?? { name: null, phone: c.sender_id ?? null };
        return { ...c, leads: lead, last_message_preview: msgs?.[0]?.content ?? null };
      })
    );

    return NextResponse.json({ success: true, conversations: withPreviews });
  } catch (error: any) {
    console.error('Conversations error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
