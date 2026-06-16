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

    // sent_via / is_historical only exist after migration 20260616. Try with
    // them; if the migration hasn't run yet, retry with the base columns so the
    // inbox keeps polling during the deploy → migration window.
    const BASE_COLS = 'id, tenant_id, conversation_id, direction, content, message_type, channel, status, error_message, created_at, ai_generated, ai_latency_ms, sender_id, wa_message_id, reply_to_message_id, media_url, media_caption, file_name, file_size, mime_type, reaction';
    const COEX_COLS = 'sent_via, is_historical';

    const runQuery = (cols: string) => {
      let q = supabaseAdmin
        .from('messages')
        .select(cols)
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (after) q = q.gt('created_at', after);
      return q.limit(50); // prevent huge payloads (ChatArea does the initial fetch)
    };

    let { data: messages, error } = await runQuery(`${BASE_COLS}, ${COEX_COLS}`);
    if (error && /column|does not exist|sent_via|is_historical/i.test(error.message || '')) {
      ({ data: messages, error } = await runQuery(BASE_COLS));
    }

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
