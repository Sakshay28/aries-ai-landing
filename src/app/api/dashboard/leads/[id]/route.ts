import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Verify the lead belongs to this tenant
    const { data: existingLead, error: getErr } = await supabaseAdmin
      .from('leads')
      .select('id, notes, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (getErr || !existingLead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    // Parse existing tags/notes
    let existingTags: string[] = [];
    let existingNotesText = '';

    if (existingLead.notes && existingLead.notes.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(existingLead.notes);
        if (parsed && typeof parsed === 'object') {
          existingTags = Array.isArray(parsed.tags) ? parsed.tags : [];
          existingNotesText = typeof parsed.notes === 'string' ? parsed.notes : existingLead.notes;
        }
      } catch (e) {
        existingNotesText = existingLead.notes;
      }
    } else {
      existingNotesText = existingLead.notes || '';
    }

    const updatePayload: any = {};

    if (body.name !== undefined) updatePayload.name = body.name || null;
    if (body.email !== undefined) updatePayload.email = body.email || null;
    if (body.phone !== undefined) updatePayload.phone = body.phone || null;
    if (body.lead_status !== undefined) updatePayload.lead_status = body.lead_status || null;
    if (body.assigned_to !== undefined) updatePayload.assigned_to = body.assigned_to || null;

    // Handle tags and notes serialization
    const tagsChanged = body.tags !== undefined;
    const notesChanged = body.notes !== undefined;

    if (tagsChanged || notesChanged) {
      const finalTags = tagsChanged ? (Array.isArray(body.tags) ? body.tags : []) : existingTags;
      const finalNotesText = notesChanged ? (typeof body.notes === 'string' ? body.notes : '') : existingNotesText;
      
      updatePayload.notes = JSON.stringify({
        tags: finalTags,
        notes: finalNotesText
      });
    }

    const { data: updatedLead, error: updateErr } = await supabaseAdmin
      .from('leads')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // Format response
    let parsedTags: string[] = [];
    let parsedNotes = '';
    if (updatedLead.notes && updatedLead.notes.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(updatedLead.notes);
        parsedTags = parsed.tags || [];
        parsedNotes = parsed.notes || '';
      } catch (e) {
        parsedNotes = updatedLead.notes;
      }
    } else {
      parsedNotes = updatedLead.notes || '';
    }

    return NextResponse.json({
      success: true,
      lead: {
        ...updatedLead,
        tags: parsedTags,
        notes: parsedNotes
      }
    });
  } catch (error: any) {
    console.error('Lead update error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
