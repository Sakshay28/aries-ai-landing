import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendInteractiveButtonsMessage, sendInteractiveListMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      conversationId,
      type,          // 'button' | 'list'
      bodyText,
      headerText,
      footerText,
      // button-specific
      buttons,
      // list-specific
      listButton,
      sections,
    } = body;

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'Missing conversationId' }, { status: 400 });
    }
    if (type !== 'button' && type !== 'list') {
      return NextResponse.json({ success: false, error: 'type must be "button" or "list"' }, { status: 400 });
    }
    if (!bodyText?.trim()) {
      return NextResponse.json({ success: false, error: 'bodyText is required' }, { status: 400 });
    }

    if (type === 'button') {
      if (!Array.isArray(buttons) || buttons.length === 0 || buttons.length > 3) {
        return NextResponse.json({ success: false, error: 'Provide 1–3 buttons' }, { status: 400 });
      }
      for (const b of buttons) {
        if (!b.id?.trim() || !b.title?.trim()) {
          return NextResponse.json({ success: false, error: 'Each button needs id and title' }, { status: 400 });
        }
        if (b.title.length > 20) {
          return NextResponse.json({ success: false, error: `Button title must be ≤ 20 chars: "${b.title}"` }, { status: 400 });
        }
      }
    }

    if (type === 'list') {
      if (!Array.isArray(sections) || sections.length === 0) {
        return NextResponse.json({ success: false, error: 'Provide at least one section' }, { status: 400 });
      }
      const totalRows = sections.reduce((n: number, s: any) => n + (s.rows?.length ?? 0), 0);
      if (totalRows === 0 || totalRows > 10) {
        return NextResponse.json({ success: false, error: 'Provide 1–10 rows across all sections' }, { status: 400 });
      }
      for (const s of sections) {
        if (!Array.isArray(s.rows) || s.rows.length === 0) {
          return NextResponse.json({ success: false, error: 'Each section needs at least one row' }, { status: 400 });
        }
        for (const r of s.rows) {
          if (!r.id?.trim() || !r.title?.trim()) {
            return NextResponse.json({ success: false, error: 'Each row needs id and title' }, { status: 400 });
          }
          if (r.title.length > 24) {
            return NextResponse.json({ success: false, error: `Row title must be ≤ 24 chars: "${r.title}"` }, { status: 400 });
          }
        }
      }
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
      return NextResponse.json({ success: false, error: 'No recipient phone on this conversation' }, { status: 400 });
    }

    let waResult: { messageId: string; status: string };
    let metadata: Record<string, unknown>;

    if (type === 'button') {
      waResult = await sendInteractiveButtonsMessage(
        decryptedToken,
        tenant.wa_phone_number_id,
        recipientPhone,
        bodyText.trim(),
        buttons.map((b: { id: string; title: string }) => ({ id: b.id.trim(), title: b.title.trim() })),
        headerText?.trim() || undefined,
        footerText?.trim() || undefined,
      );
      metadata = {
        interactive_type: 'button',
        buttons: buttons.map((b: { id: string; title: string }) => ({ id: b.id.trim(), title: b.title.trim() })),
        ...(headerText?.trim() ? { header: headerText.trim() } : {}),
        ...(footerText?.trim() ? { footer: footerText.trim() } : {}),
      };
    } else {
      waResult = await sendInteractiveListMessage(
        decryptedToken,
        tenant.wa_phone_number_id,
        recipientPhone,
        bodyText.trim(),
        (listButton?.trim() || 'View options'),
        sections,
        headerText?.trim() || undefined,
        footerText?.trim() || undefined,
      );
      metadata = {
        interactive_type: 'list',
        list_button: listButton?.trim() || 'View options',
        sections,
        ...(headerText?.trim() ? { header: headerText.trim() } : {}),
        ...(footerText?.trim() ? { footer: footerText.trim() } : {}),
      };
    }

    const { data: savedMsg, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: bodyText.trim(),
        message_type: 'interactive',
        channel: 'whatsapp',
        status: 'sent',
        ai_generated: false,
        wa_message_id: waResult.messageId,
        metadata,
      })
      .select()
      .single();

    if (insertErr || !savedMsg) {
      console.error('[send-interactive] DB insert failed:', insertErr?.message);
      return NextResponse.json({ success: false, error: 'Failed to save message' }, { status: 500 });
    }

    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), is_active: true })
      .eq('id', conversationId);

    return NextResponse.json({ success: true, messageId: waResult.messageId, message: savedMsg });
  } catch (err: any) {
    console.error('[dashboard/chat/send-interactive]', err.message);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
