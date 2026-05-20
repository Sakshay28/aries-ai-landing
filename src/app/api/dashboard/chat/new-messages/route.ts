import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// Lightweight polling endpoint — returns only messages created after `after` timestamp.
// Used by ChatArea to guarantee real-time message delivery via polling fallback.
export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');
    const after = searchParams.get('after'); // ISO timestamp

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'conversationId required' }, { status: 400 });
    }

    // Build query — fetch messages newer than `after` timestamp
    let query = supabaseAdmin
      .from('messages')
      .select('id, conversation_id, direction, content, message_type, status, created_at, ai_generated, sender_id, wa_message_id')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (after) {
      query = query.gt('created_at', after);
    }

    // Limit to prevent huge payloads on first load (shouldn't happen since ChatArea does initial fetch)
    query = query.limit(50);

    const { data: messages, error } = await query;

    if (error) {
      console.error('new-messages poll error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, messages: messages || [] });
  } catch (error: any) {
    console.error('new-messages poll error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
