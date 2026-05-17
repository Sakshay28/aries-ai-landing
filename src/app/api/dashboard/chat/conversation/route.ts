import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
    }

    // Get conversation details
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, is_active, bot_paused, sender_name, leads(name, phone)")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ success: false, error: convErr?.message || 'Not found' }, { status: 404 });
    }

    // Get messages
    const { data: msgs, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      success: true,
      conversation: conv,
      messages: msgs || []
    });
  } catch (error: any) {
    console.error('Conversation fetch error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
