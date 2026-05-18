import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch recent messages and their conversation context
  const { data: messages, error } = await supabaseAdmin
    .from('messages')
    .select(`
      id,
      direction,
      content,
      created_at,
      status,
      ai_generated,
      conversations (
        sender_id,
        context,
        flow_type,
        current_step
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Format into a log-like structure
  const logs = messages?.map(msg => {
    const conv = Array.isArray(msg.conversations) ? msg.conversations[0] : msg.conversations;
    const context = (conv?.context as Record<string, any>) || {};
    
    return {
      id: msg.id,
      timestamp: msg.created_at,
      direction: msg.direction,
      message: msg.content,
      sender: conv?.sender_id || 'Unknown',
      ai_generated: msg.ai_generated,
      status: msg.status,
      flow_fired: conv?.flow_type || null,
      intent: context.intent || null,
      payment_requested: context.requestPayment === 'true',
      payment_amount: context.paymentAmount || null,
    };
  }) || [];

  return NextResponse.json({ success: true, data: logs });
}
