import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { sanitizeInput } from '@/lib/utils/safety';
import { logAudit } from '@/lib/audit/logger';

// Payload validation schemas
const createNoteSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
  contactId: z.string().uuid('Invalid contact ID'),
  text: z.string().trim().min(1, 'Note cannot be empty').max(2000, 'Note too long (max 2000 chars)'),
  idempotencyKey: z.string().max(100).optional().nullable(),
});

const updateNoteSchema = z.object({
  id: z.string().uuid('Invalid note ID'),
  text: z.string().trim().min(1, 'Note cannot be empty').max(2000, 'Note too long (max 2000 chars)'),
});

// ── GET: Fetch notes for a conversation ──
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'Missing conversationId' }, { status: 400 });
    }

    const { data: notes, error } = await supabaseAdmin
      .from('notes')
      .select('id, text, created_at, created_by, created_by_name')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', me.tenant_id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[NOTES_GET_FAILED]', {
        tenantId: me.tenant_id,
        conversationId,
        error: error.message,
      });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Map to camelCase requested output format
    const formattedNotes = (notes || []).map(n => ({
      id: n.id,
      text: n.text,
      createdAt: n.created_at,
      createdBy: n.created_by_name,
    }));

    return NextResponse.json({ success: true, notes: formattedNotes });
  } catch (err: any) {
    console.error('[NOTES_GET_UNEXPECTED_ERROR]', { error: err.message, stack: err.stack });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── POST: Create a note ──
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = me.tenant_id;
  const userId = me.id;
  let body: any;

  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Malformed JSON payload' }, { status: 400 });
  }

  // Payload validation
  const validation = createNoteSchema.safeParse(body);
  if (!validation.success) {
    const errorDetails = validation.error.format();
    console.warn('[NOTE_CREATION_VALIDATION_FAILED]', {
      tenantId,
      userId,
      payload: body,
      validationError: errorDetails,
    });
    return NextResponse.json({ success: false, error: 'Validation failed', details: errorDetails }, { status: 400 });
  }

  const { conversationId, contactId, text, idempotencyKey } = validation.data;
  const sanitizedText = sanitizeInput(text, 2000);

  if (!sanitizedText) {
    return NextResponse.json({ success: false, error: 'Note content is empty or contains only invalid characters' }, { status: 400 });
  }

  try {
    // 1. Verify conversation ownership
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (convErr || !conversation) {
      console.warn('[NOTE_CREATION_UNAUTHORIZED_CONVERSATION]', { tenantId, conversationId, error: convErr?.message });
      return NextResponse.json({ success: false, error: 'Conversation not found or access denied' }, { status: 404 });
    }

    // 2. Verify contact ownership
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (contactErr || !contact) {
      console.warn('[NOTE_CREATION_UNAUTHORIZED_CONTACT]', { tenantId, contactId, error: contactErr?.message });
      return NextResponse.json({ success: false, error: 'Contact not found or access denied' }, { status: 404 });
    }

    const agentName = me.full_name || me.email || 'Agent';

    // 3. Attempt DB insert
    const insertPayload = {
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      created_by: userId,
      created_by_name: agentName,
      text: sanitizedText,
      idempotency_key: idempotencyKey || null,
    };

    const { data: note, error: insertErr } = await supabaseAdmin
      .from('notes')
      .insert(insertPayload)
      .select('id, text, created_at, created_by, created_by_name')
      .single();

    // 4. Handle unique violation for idempotency key
    if (insertErr && insertErr.code === '23505' && idempotencyKey) {
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('notes')
        .select('id, text, created_at, created_by, created_by_name')
        .eq('idempotency_key', idempotencyKey)
        .eq('tenant_id', tenantId)
        .single();

      if (existing) {
        console.log('[NOTE_CREATION_IDEMPOTENCY_MATCH]', {
          tenantId,
          idempotencyKey,
          noteId: existing.id,
        });

        return NextResponse.json({
          id: existing.id,
          text: existing.text,
          createdAt: existing.created_at,
          createdBy: existing.created_by_name,
        }, { status: 200 }); // Return existing note successfully
      }
    }

    if (insertErr) {
      console.error('[NOTE_CREATION_DB_FAILED]', {
        tenantId,
        conversationId,
        contactId,
        userId,
        error: insertErr.message,
        code: insertErr.code,
      });
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
    }

    // Success Audit Trail
    logAudit({
      tenant_id: tenantId,
      actor_id: userId,
      actor_email: me.email,
      action: 'note_created' as any,
      entity: 'note',
      entity_id: note.id,
      new_value: { text: note.text },
    });

    console.log('[NOTE_CREATION_SUCCESS]', {
      tenantId,
      conversationId,
      contactId,
      userId,
      timestamp: new Date().toISOString(),
      payload: { text, idempotencyKey },
      dbResult: note,
      apiResponseStatus: 201,
    });

    return NextResponse.json({
      id: note.id,
      text: note.text,
      createdAt: note.created_at,
      createdBy: note.created_by_name,
    }, { status: 201 });

  } catch (err: any) {
    console.error('[NOTE_CREATION_UNEXPECTED_ERROR]', {
      tenantId,
      conversationId,
      contactId,
      userId,
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── PATCH: Edit a note ──
export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Malformed JSON payload' }, { status: 400 });
  }

  const validation = updateNoteSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, error: 'Validation failed', details: validation.error.format() }, { status: 400 });
  }

  const { id, text } = validation.data;
  const sanitizedText = sanitizeInput(text, 2000);

  if (!sanitizedText) {
    return NextResponse.json({ success: false, error: 'Note content is empty or contains only invalid characters' }, { status: 400 });
  }

  try {
    // Check ownership
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('notes')
      .select('id, text, tenant_id')
      .eq('id', id)
      .eq('tenant_id', me.tenant_id)
      .maybeSingle();

    if (findErr || !existing) {
      return NextResponse.json({ success: false, error: 'Note not found or access denied' }, { status: 404 });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('notes')
      .update({ text: sanitizedText, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', me.tenant_id)
      .select('id, text, created_at, created_by, created_by_name')
      .single();

    if (updateErr) {
      console.error('[NOTE_UPDATE_FAILED]', { tenantId: me.tenant_id, noteId: id, error: updateErr.message });
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    logAudit({
      tenant_id: me.tenant_id,
      actor_id: me.id,
      actor_email: me.email,
      action: 'note_edited' as any,
      entity: 'note',
      entity_id: id,
      old_value: { text: existing.text },
      new_value: { text: updated.text },
    });

    return NextResponse.json({
      success: true,
      note: {
        id: updated.id,
        text: updated.text,
        createdAt: updated.created_at,
        createdBy: updated.created_by_name,
      }
    });

  } catch (err: any) {
    console.error('[NOTE_UPDATE_UNEXPECTED_ERROR]', { error: err.message, stack: err.stack });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── DELETE: Delete a note ──
export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing id query parameter' }, { status: 400 });
  }

  try {
    // Check ownership
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('notes')
      .select('id, text, tenant_id')
      .eq('id', id)
      .eq('tenant_id', me.tenant_id)
      .maybeSingle();

    if (findErr || !existing) {
      return NextResponse.json({ success: false, error: 'Note not found or access denied' }, { status: 404 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('tenant_id', me.tenant_id);

    if (deleteErr) {
      console.error('[NOTE_DELETE_FAILED]', { tenantId: me.tenant_id, noteId: id, error: deleteErr.message });
      return NextResponse.json({ success: false, error: deleteErr.message }, { status: 500 });
    }

    logAudit({
      tenant_id: me.tenant_id,
      actor_id: me.id,
      actor_email: me.email,
      action: 'note_deleted' as any,
      entity: 'note',
      entity_id: id,
      old_value: { text: existing.text },
    });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[NOTE_DELETE_UNEXPECTED_ERROR]', { error: err.message, stack: err.stack });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
