import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sendTextMessage } from '@/lib/gupshup/service';

export async function POST(req: NextRequest) {
  try {
    const { conversationId, message } = await req.json();

    if (!conversationId || !message?.trim()) {
      return NextResponse.json({ success: false, error: 'Missing conversationId or message' }, { status: 400 });
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Verify conversation belongs to this tenant and get the recipient phone
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, sender_id, tenant_id, leads(phone)')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    // Get tenant credentials (admin client needed for gupshup keys)
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('gupshup_api_key, gupshup_phone_number')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!tenant.gupshup_api_key || !tenant.gupshup_phone_number) {
      return NextResponse.json({ success: false, error: 'Gupshup is not configured in Settings' }, { status: 400 });
    }

    // Determine recipient phone number
    const recipientPhone = (conv.leads as { phone: string | null } | null)?.phone || conv.sender_id;

    // Insert the outbound message into the messages table first
    const { data: insertedMsg, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: message.trim(),
        message_type: 'text',
        channel: 'whatsapp',
        sender_id: null,
        status: 'pending',
        ai_generated: false,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Failed to insert message:', insertErr);
      return NextResponse.json({ success: false, error: 'Failed to store message' }, { status: 500 });
    }

    // Send via Gupshup WhatsApp API
    let waMessageId: string | null = null;
    try {
      const waResult = await sendTextMessage(
        tenant.gupshup_api_key,
        tenant.gupshup_phone_number,
        recipientPhone,
        message.trim()
      );
      waMessageId = waResult.messageId;
    } catch (waErr) {
      console.error('Gupshup send failed:', waErr);
      // Update message status to failed
      await supabaseAdmin
        .from('messages')
        .update({ status: 'failed' })
        .eq('id', insertedMsg.id);
      return NextResponse.json({ success: false, error: 'WhatsApp delivery failed' }, { status: 502 });
    }

    // Update message with WhatsApp message ID and sent status
    await supabaseAdmin
      .from('messages')
      .update({ status: 'sent', wa_message_id: waMessageId })
      .eq('id', insertedMsg.id);

    // Update conversation's last_message_at
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return NextResponse.json({ success: true, messageId: insertedMsg.id });

  } catch (err) {
    console.error('Chat send error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
