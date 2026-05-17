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
      .select("id, last_message_at, is_active, bot_paused, leads(name, phone)")
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

    // Fetch previews
    const withPreviews = await Promise.all(
      convos.map(async (c: any) => {
        const { data: msgs } = await supabaseAdmin
          .from("messages")
          .select("content")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1);
        return { ...c, last_message_preview: msgs?.[0]?.content ?? null };
      })
    );

    return NextResponse.json({ success: true, conversations: withPreviews });
  } catch (error: any) {
    console.error('Conversations error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
