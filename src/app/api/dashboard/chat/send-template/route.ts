import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { conversationId, templateName, variables = [], language = 'en' } = await req.json();
    if (!conversationId || !templateName) {
      return NextResponse.json({ success: false, error: 'Missing conversationId or templateName' }, { status: 400 });
    }

    const [convResult, tenantResult] = await Promise.all([
      supabaseAdmin
        .from('conversations')
        .select('id, sender_id, tenant_id, leads(phone)')
        .eq('id', conversationId)
        .eq('tenant_id', tenantId)
        .single(),
      supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id')
        .eq('id', tenantId)
        .single(),
    ]);

    if (convResult.error || !convResult.data) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }
    if (tenantResult.error || !tenantResult.data) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const conv = convResult.data;
    const tenant = tenantResult.data;

    if (!tenant.wa_access_token || !tenant.wa_phone_number_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp not configured' }, { status: 400 });
    }

    const decryptedToken = decryptToken(tenant.wa_access_token);
    if (!decryptedToken) {
      return NextResponse.json({ success: false, error: 'Access token decryption failed' }, { status: 500 });
    }

    const leadsData = conv.leads as unknown as { phone: string | null } | { phone: string | null }[] | null;
    const leadPhone = Array.isArray(leadsData) ? leadsData[0]?.phone : leadsData?.phone;
    const recipientPhone = leadPhone || conv.sender_id;
    if (!recipientPhone) {
      return NextResponse.json({ success: false, error: 'No recipient phone number on this conversation' }, { status: 400 });
    }

    const mappedVariables = Array.isArray(variables) ? variables.map(String) : [];

    const waResult = await sendTemplateMessage(
      decryptedToken,
      tenant.wa_phone_number_id,
      recipientPhone,
      templateName,
      mappedVariables,
      language,
    );

    // Log in conversation so the template bubble appears in chat
    const previewText = mappedVariables.length > 0
      ? `[Template: ${templateName}] ${mappedVariables.join(', ')}`
      : `[Template: ${templateName}]`;

    await Promise.all([
      supabaseAdmin.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: previewText,
        message_type: 'template',
        channel: 'whatsapp',
        status: 'sent',
        ai_generated: false,
        wa_message_id: waResult.messageId,
        metadata: { interactive_type: 'template', template_name: templateName },
      }),
      supabaseAdmin
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), is_active: true })
        .eq('id', conversationId),
    ]);

    return NextResponse.json({ success: true, messageId: waResult.messageId });
  } catch (err: any) {
    console.error('[dashboard/chat/send-template]', err.message);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
