import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { deleteWhatsAppMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { messageId, type } = body;

    if (!messageId || !type) {
      return NextResponse.json({ success: false, error: 'messageId and type required' }, { status: 400 });
    }

    if (type !== 'me' && type !== 'everyone') {
      return NextResponse.json({ success: false, error: 'Invalid delete type' }, { status: 400 });
    }

    // 1. Fetch message and verify ownership
    const { data: msg, error: fetchErr } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchErr || !msg) {
      return NextResponse.json({ success: false, error: fetchErr?.message || 'Message not found' }, { status: 404 });
    }

    if (type === 'me') {
      // "Delete for me" -> completely remove message row from DB
      const { error: delErr } = await supabaseAdmin
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('tenant_id', tenantId);

      if (delErr) {
        return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, type: 'me' });
    } else {
      // "Delete for everyone" -> replace content with clean placeholder '__DELETED__'
      const { error: updateErr } = await supabaseAdmin
        .from('messages')
        .update({ content: '__DELETED__', reaction: null })
        .eq('id', messageId)
        .eq('tenant_id', tenantId);

      if (updateErr) {
        return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
      }

      // Try unsending on Meta WhatsApp API if message is outbound, has wa_message_id
      if (msg.direction === 'outbound' && msg.wa_message_id) {
        try {
          // Fetch tenant credentials to get access token and phone number ID
          const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('wa_access_token, wa_phone_number_id')
            .eq('id', tenantId)
            .single();

          if (tenant?.wa_access_token && tenant?.wa_phone_number_id) {
            const token = decryptToken(tenant.wa_access_token);
            if (token) {
              await deleteWhatsAppMessage(token, tenant.wa_phone_number_id, msg.wa_message_id);
              console.log(`✅ Attempted WhatsApp unsend for message ${messageId} (wa_id: ${msg.wa_message_id})`);
            }
          }
        } catch (metaErr) {
          console.error(`⚠️ Failed to unsend message ${messageId} via Meta API:`, metaErr);
        }
      }

      return NextResponse.json({ success: true, type: 'everyone' });
    }
  } catch (error: any) {
    console.error('Delete message error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
