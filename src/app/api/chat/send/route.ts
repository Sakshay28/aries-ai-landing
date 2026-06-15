import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sendTextMessage } from '@/lib/meta/service';
import { sendInstagramMessage } from '@/lib/instagram/service';
import { decryptToken } from '@/lib/utils/crypto';

export async function POST(req: NextRequest) {
  try {
    const { conversationId, message, replyToMessageId } = await req.json();

    if (!conversationId || !message?.trim()) {
      return NextResponse.json({ success: false, error: 'Missing conversationId or message' }, { status: 400 });
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Fetch conversation + tenant credentials in parallel to cut latency
    const [convResult, tenantResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, sender_id, tenant_id, channel, leads(phone)')
        .eq('id', conversationId)
        .eq('tenant_id', tenantId)
        .single(),
      supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id')
        .eq('id', tenantId)
        .single(),
    ]);

    const { data: conv, error: convErr } = convResult;
    const { data: tenant, error: tenantErr } = tenantResult;

    if (convErr || !conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!tenant.wa_access_token || !tenant.wa_phone_number_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not yet active for your account. Contact support.' }, { status: 400 });
    }

    // Determine recipient phone number
    const leadsData = conv.leads as unknown as { phone: string | null } | { phone: string | null }[] | null;
    const leadPhone = Array.isArray(leadsData) ? leadsData[0]?.phone : leadsData?.phone;
    const recipientPhone = leadPhone || conv.sender_id;

    // Insert the outbound message — optimistically mark as 'sent' so the client
    // shows a tick immediately. after() will flip to 'failed' if Meta rejects.
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
        status: 'sent',
        ai_generated: false,
        reply_to_message_id: replyToMessageId || null,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Failed to insert message:', insertErr);
      return NextResponse.json({ success: false, error: 'Failed to store message' }, { status: 500 });
    }

    // Return to client immediately — tick appears without waiting for Meta API
    const response = NextResponse.json({ success: true, messageId: insertedMsg.id, message: insertedMsg });

    // Fire Meta API + cleanup after the response has been sent
    after(async () => {
      try {
        let externalMessageId: string | null = null;

        if (conv.channel === 'instagram_dm') {
          await sendInstagramMessage(tenant as unknown as Parameters<typeof sendInstagramMessage>[0], recipientPhone, message.trim());
          externalMessageId = 'ig_' + Date.now().toString();
        } else {
          const decryptedToken = decryptToken(tenant.wa_access_token);
          if (!decryptedToken) throw new Error('Access token decryption failed');

          // Fetch parent WA message id for quoted replies
          let parentWaMessageId: string | undefined = undefined;
          if (replyToMessageId) {
            const { data: parentMsg } = await supabaseAdmin
              .from('messages')
              .select('wa_message_id')
              .eq('id', replyToMessageId)
              .single();
            if (parentMsg?.wa_message_id) parentWaMessageId = parentMsg.wa_message_id;
          }

          const waResult = await sendTextMessage(
            decryptedToken,
            tenant.wa_phone_number_id,
            recipientPhone,
            message.trim(),
            parentWaMessageId
          );
          externalMessageId = waResult.messageId;
        }

        // Stamp the wa_message_id so delivery webhooks can correlate
        await supabaseAdmin
          .from('messages')
          .update({ wa_message_id: externalMessageId })
          .eq('id', insertedMsg.id);
      } catch (apiErr) {
        console.error('Async Meta send failed:', apiErr);
        // Realtime pushes this UPDATE to the client — tick flips to ❌
        await supabaseAdmin
          .from('messages')
          .update({ status: 'failed' })
          .eq('id', insertedMsg.id);
      }

      // Keep conversation.last_message_at fresh and reactivate the thread — an agent
      // replying to a thread the nightly cron put to sleep must keep it active so the
      // webhook routes the customer's next message back into THIS same thread.
      await supabaseAdmin
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), is_active: true })
        .eq('id', conversationId);
    });

    return response;

  } catch (err) {
    console.error('Chat send error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
