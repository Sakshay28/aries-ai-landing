import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// Lightweight endpoint: returns only { id, status } for outbound messages in a conversation.
// Used for polling when real-time subscription is unavailable.
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) return NextResponse.json({ success: false }, { status: 400 });

  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('messages')
    .select('id, status')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ success: true, statuses: data || [] });
}
