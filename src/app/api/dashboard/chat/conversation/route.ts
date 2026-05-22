import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

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
    let lead = null;
    if (conv.lead_id) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('id, name, phone, email, lead_status, lead_score, notes, created_at, first_message_at, assigned_to')
        .eq('id', conv.lead_id)
        .single();
      if (!error && data) {
        lead = data;
      }
    }
    if (!lead && conv.sender_id) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('id, name, phone, email, lead_status, lead_score, notes, created_at, first_message_at, assigned_to')
        .eq('tenant_id', tenantId)
        .eq('phone', conv.sender_id)
        .maybeSingle();
      if (!error && data) {
        lead = data;
        // Since we found it via sender_id, let's update the conversation's lead_id
        await supabaseAdmin
          .from('conversations')
          .update({ lead_id: lead.id })
          .eq('id', id);
      }
    }

    // If we STILL don't have a lead, let's create one automatically!
    if (!lead) {
      const newLeadData = {
        tenant_id: tenantId,
        phone: conv.sender_id || null,
        name: conv.sender_name || conv.sender_id || 'Unknown',
        lead_status: 'new',
        lead_score: 0,
        first_message_at: new Date().toISOString()
      };

      const { data: createdLead, error: createLeadErr } = await supabaseAdmin
        .from('leads')
        .insert(newLeadData)
        .select()
        .single();

      if (!createLeadErr && createdLead) {
        lead = createdLead;
        // Update the conversation's lead_id
        await supabaseAdmin
          .from('conversations')
          .update({ lead_id: lead.id })
          .eq('id', id);
      }
    }

    // Parse existing tags/notes from the notes column
    if (lead) {
      let parsedTags: string[] = [];
      let parsedNotes = '';
      if (lead.notes && lead.notes.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(lead.notes);
          if (parsed && typeof parsed === 'object') {
            parsedTags = Array.isArray(parsed.tags) ? parsed.tags : [];
            parsedNotes = typeof parsed.notes === 'string' ? parsed.notes : lead.notes;
          }
        } catch (e) {
          parsedNotes = lead.notes;
        }
      } else {
        parsedNotes = lead.notes || '';
      }
      lead = {
        ...lead,
        tags: parsedTags,
        notes: parsedNotes
      };
    }

    // Get messages
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

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
    const { bot_paused, is_active } = body;

    const updatePayload: any = {};
    if (bot_paused !== undefined) {
      if (typeof bot_paused !== 'boolean') {
        return NextResponse.json({ success: false, error: 'bot_paused must be a boolean' }, { status: 400 });
      }
      updatePayload.bot_paused = bot_paused;
      if (!bot_paused) {
        updatePayload.escalated = false;
        updatePayload.escalated_at = null;
        updatePayload.escalation_reason = null;
      }
    }

    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return NextResponse.json({ success: false, error: 'is_active must be a boolean' }, { status: 400 });
      }
      updatePayload.is_active = is_active;
      if (!is_active) {
        updatePayload.bot_paused = false;
        updatePayload.escalated = false;
        updatePayload.escalated_at = null;
        updatePayload.escalation_reason = null;
        updatePayload.current_step = 'greeting';
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("conversations")
      .update(updatePayload)
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...updatePayload });
  } catch (error: any) {
    console.error('Conversation PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
