import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { triggerAutomations } from '@/lib/automations/engine';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
    }

    // Get conversation details (no join — explicit queries are more reliable)
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, is_active, bot_paused, sender_name, sender_id, lead_id, escalated")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ success: false, error: convErr?.message || 'Not found' }, { status: 404 });
    }

    // Fetch lead: first try lead_id FK, fallback to phone (sender_id) lookup
    let lead: Record<string, any> | null = null;
    const LEAD_FIELDS = 'id, name, phone, email, lead_status, lead_score, tags, created_at, first_message_at, last_message_at, assigned_to';
    if (conv.lead_id) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select(LEAD_FIELDS)
        .eq('id', conv.lead_id)
        .single();
      lead = data;
    }
    if (!lead && conv.sender_id) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select(LEAD_FIELDS)
        .eq('tenant_id', tenantId)
        .eq('phone', conv.sender_id)
        .maybeSingle();
      lead = data;
    }

    // Get messages — filter by tenant_id for defense-in-depth (admin client bypasses RLS)
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    // Self-heal the lead's last_message_at from the actual newest message —
    // the webhook's lead update can lag, leaving the CRM panel showing stale times
    const newestAt = msgs?.length ? msgs[msgs.length - 1].created_at : null;
    if (lead && newestAt && (!lead.last_message_at || newestAt > lead.last_message_at)) {
      lead = { ...lead, last_message_at: newestAt };
    }

    return NextResponse.json({
      success: true,
      conversation: { ...conv, leads: lead },
      messages: msgs || []
    });
  } catch (error: any) {
    console.error('Conversation fetch error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
    }

    const body = await req.json();
    const updateData: Record<string, any> = {};

    if (typeof body.bot_paused === 'boolean') {
      updateData.bot_paused = body.bot_paused;
      if (!body.bot_paused) {
        updateData.escalated = false;
        updateData.escalation_reason = null;
      }
    }
    if (typeof body.escalated === 'boolean') {
      updateData.escalated = body.escalated;
      if (!body.escalated) {
        updateData.escalation_reason = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields provided for update' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("conversations")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (updateData.escalated === false) {
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('lead_id')
        .eq('id', id)
        .single();
      if (conv?.lead_id) {
        triggerAutomations({
          tenantId, event: 'escalation_resolved', leadId: conv.lead_id,
          conversationId: id,
        }).catch(e => console.error('Automations (escalation_resolved):', e.message));
      }
    }

    return NextResponse.json({ success: true, ...updateData });
  } catch (error: any) {
    console.error('Conversation PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
