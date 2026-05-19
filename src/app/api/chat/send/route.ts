import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sendTextMessage } from '@/lib/gupshup/service';
import { sendInstagramMessage } from '@/lib/instagram/service';
import { decryptToken } from '@/lib/utils/crypto';

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
      .select('id, sender_id, tenant_id, channel, leads(phone)')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    // Get tenant credentials (admin client needed for gupshup keys)
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('gupshup_api_key, gupshup_phone_number, gupshup_app_name')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!tenant.gupshup_api_key || !tenant.gupshup_phone_number || !tenant.gupshup_app_name) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not yet active for your account. Contact support.' }, { status: 400 });
    }

    // Determine recipient phone number
    const leadsData = conv.leads as unknown as { phone: string | null } | { phone: string | null }[] | null;
    const leadPhone = Array.isArray(leadsData) ? leadsData[0]?.phone : leadsData?.phone;
    const recipientPhone = leadPhone || conv.sender_id;

    // Insert the outbound message into the messages table first
    const { data: insertedMsg, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: message.trim(),
        message_type: 'text',
        channel: conv.channel || 'whatsapp',
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

    // Send via respective channel API
    let externalMessageId: string | null = null;
    try {
      if (conv.channel === 'instagram_dm') {
        // Send via Instagram
        await sendInstagramMessage(tenant as unknown as Parameters<typeof sendInstagramMessage>[0], recipientPhone, message.trim());
        externalMessageId = "ig_" + Date.now().toString(); // Mock ID for IG since it doesn't return one directly in all cases
      } else {
        // Default to Gupshup WhatsApp
        const waResult = await sendTextMessage(
          decryptToken(tenant.gupshup_api_key) as string,
          tenant.gupshup_phone_number,
          recipientPhone,
          message.trim(),
          tenant.gupshup_app_name
        );
        externalMessageId = waResult.messageId;
      }
    } catch (apiErr) {
      console.error('API send failed:', apiErr);
      await supabaseAdmin
        .from('messages')
        .update({ status: 'failed' })
        .eq('id', insertedMsg.id);
      return NextResponse.json({ success: false, error: 'Message delivery failed' }, { status: 502 });
    }

    // Update message status
    await supabaseAdmin
      .from('messages')
      .update({ status: 'sent', wa_message_id: externalMessageId })
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
