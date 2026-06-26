import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export async function POST(req: NextRequest) {
  try {
    // 1. Resolve Tenant ID from server-sent X-Aries-Tenant header
    const tenantId = req.headers.get('x-aries-tenant');
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Missing X-Aries-Tenant header' }, { status: 401 });
    }

    // 2. Parse request payload
    const body = await req.json().catch(() => ({}));
    const { phone, templateName, variables = [], language = 'en', conversationId, headerImageUrl } = body;

    if (!phone || !templateName) {
      return NextResponse.json({ success: false, error: 'Missing phone or templateName in payload' }, { status: 400 });
    }

    // 3. Fetch Tenant Credentials
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id, business_name')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!tenant.wa_access_token || !tenant.wa_phone_number_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp integration is not active for this tenant' }, { status: 400 });
    }

    const decryptedToken = decryptToken(tenant.wa_access_token);
    if (!decryptedToken) {
      return NextResponse.json({ success: false, error: 'Access token decryption failed' }, { status: 500 });
    }

    // 4. Send Template Message via Meta Cloud API
    // Mapping clean, simple array variables to Meta body parameters
    const mappedVariables = Array.isArray(variables) ? variables.map(String) : [];
    
    // Transform parameters into proper components when headerImageUrl exists (image-header template)
    let componentsToSend: any[] = [];
    if (headerImageUrl && typeof headerImageUrl === 'string' && headerImageUrl.trim()) {
      componentsToSend = [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: headerImageUrl.trim()
              }
            }
          ]
        },
        {
          type: 'body',
          parameters: mappedVariables.map(val => ({
            type: 'text',
            text: String(val)
          }))
        }
      ];
    } else {
      // Backward compatibility: pass simple string array directly
      componentsToSend = mappedVariables;
    }

    // Verification logs for outgoing payload in dev mode
    if (process.env.NODE_ENV === 'development') {
      console.log('🧪 [DEV MODE] Outgoing WhatsApp template components:', JSON.stringify(componentsToSend, null, 2));
    }

    console.log(`🚀 [SEND TEMPLATE] Hitting Meta Cloud API for ${tenant.business_name}:`, {
      destination: phone,
      template: templateName,
      language,
      varsCount: mappedVariables.length,
      hasHeaderImage: !!headerImageUrl
    });

    const waResult = await sendTemplateMessage(
      decryptedToken,
      tenant.wa_phone_number_id,
      phone,
      templateName,
      componentsToSend,
      language
    );

    // 5. Optionally log message in Database under the active conversation (for Live Chat UI)
    if (conversationId) {
      try {
        const previewText = mappedVariables.length > 0
          ? `[Template: ${templateName}] ${mappedVariables.join(', ')}`
          : `[Template: ${templateName}]`;
        await supabaseAdmin.from('messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          direction: 'outbound',
          content: previewText,
          message_type: 'template' as string,
          channel: 'whatsapp',
          status: 'sent',
          ai_generated: false,
          wa_message_id: waResult.messageId,
          metadata: {
            interactive_type: 'template',
            template_name: templateName,
            ...(headerImageUrl ? { header: { type: 'image', url: headerImageUrl } } : {}),
          },
        });

        // Update conversation timestamp
        await supabaseAdmin
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);
      } catch (logErr: any) {
        console.error('⚠️ [SEND TEMPLATE] Database logging failed (non-blocking):', logErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      messageId: waResult.messageId,
      status: waResult.status
    });

  } catch (err: any) {
    console.error('❌ [SEND TEMPLATE] Internal Route Error:', err.message);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
