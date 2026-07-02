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

const NOTE_SELECT = 'id, text, created_at, created_by, created_by_name, idempotency_key';

function formatNote(n: any) {
  return {
    id: n.id,
    text: n.text,
    createdAt: n.created_at,
    createdBy: n.created_by_name,
    idempotencyKey: n.idempotency_key ?? null,
  };
}

// ── GET: Fetch notes for a contact (falls back to conversation) ──
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      console.warn('[Notes] GET rejected: unauthenticated');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');
    const conversationId = searchParams.get('conversationId');

    if (!contactId && !conversationId) {
      return NextResponse.json({ success: false, error: 'Missing contactId or conversationId' }, { status: 400 });
    }

    // Scope by contact_id whenever available: a contact can span multiple
    // conversation threads (new WhatsApp session, 24h-window reset, etc.),
    // so scoping strictly by conversation_id makes historical notes vanish
    // the moment a new thread opens for the same customer.
    let query = supabaseAdmin
      .from('notes')
      .select(NOTE_SELECT)
      .eq('tenant_id', me.tenant_id)
      .is('deleted_at', null);

    query = contactId ? query.eq('contact_id', contactId) : query.eq('conversation_id', conversationId as string);
    query = query.order('created_at', { ascending: true });

    console.log('[Notes] GET started', { tenantId: me.tenant_id, contactId, conversationId });

    const { data: notes, error } = await query;

    if (error) {
      console.error('[Notes] GET failed', {
        tenantId: me.tenant_id,
        contactId,
        conversationId,
        error: error.message,
        code: error.code,
      });
      return NextResponse.json({ success: false, code: 'NOTES_FETCH_FAILED', error: error.message }, { status: 500 });
    }

    console.log('[Notes] GET succeeded', { tenantId: me.tenant_id, contactId, conversationId, count: notes?.length ?? 0 });

    return NextResponse.json({ success: true, notes: (notes || []).map(formatNote) });
  } catch (err: any) {
    console.error('[Notes] GET unexpected error', { error: err.message, stack: err.stack });
    return NextResponse.json({ success: false, code: 'NOTES_FETCH_FAILED', error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── POST: Create a note ──
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    console.warn('[Notes] POST rejected: unauthenticated');
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
    console.warn('[Notes] POST validation failed', {
      tenantId,
      userId,
      payload: body,
      validationError: errorDetails,
    });
    return NextResponse.json({ success: false, error: 'Validation failed', details: errorDetails }, { status: 400 });
  }
  console.log('[Notes] POST validation passed', { tenantId, userId });

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
      console.warn('[Notes] POST rejected: conversation not found or access denied', { tenantId, conversationId, error: convErr?.message });
      return NextResponse.json({ success: false, error: 'Conversation not found or access denied' }, { status: 404 });
    }
    console.log('[Notes] POST conversation resolved', { tenantId, conversationId });

    // 2. Verify contact ownership
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (contactErr || !contact) {
      console.warn('[Notes] POST rejected: contact not found or access denied', { tenantId, contactId, error: contactErr?.message });
      return NextResponse.json({ success: false, error: 'Contact not found or access denied' }, { status: 404 });
    }
    console.log('[Notes] POST contact resolved', { tenantId, contactId });

    const agentName = me.full_name || me.email || 'Agent';

    // 3. Attempt DB insert. PostgREST performs this as a single statement and
    // the .select().single() below is a RETURNING clause on the same insert —
    // there is no window where the row can exist without also being returned.
    const insertPayload = {
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      created_by: userId,
      created_by_name: agentName,
      text: sanitizedText,
      idempotency_key: idempotencyKey || null,
    };

    console.log('[Notes] POST insert started', { tenantId, conversationId, contactId, idempotencyKey });

    const { data: note, error: insertErr } = await supabaseAdmin
      .from('notes')
      .insert(insertPayload)
      .select(NOTE_SELECT)
      .single();

    // 4. Handle unique violation for idempotency key
    if (insertErr && insertErr.code === '23505' && idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from('notes')
        .select(NOTE_SELECT)
        .eq('idempotency_key', idempotencyKey)
        .eq('tenant_id', tenantId)
        .single();

      if (existing) {
        console.log('[Notes] POST idempotency match — returning existing note', {
          tenantId,
          idempotencyKey,
          noteId: existing.id,
        });

        return NextResponse.json(formatNote(existing), { status: 200 });
      }
    }

    if (insertErr || !note) {
      console.error('[Notes] POST insert failed', {
        tenantId,
        conversationId,
        contactId,
        userId,
        error: insertErr?.message,
        code: insertErr?.code,
      });
      return NextResponse.json({
        success: false,
        code: 'NOTE_SAVE_FAILED',
        error: insertErr?.message || 'Database insert failed',
      }, { status: 500 });
    }

    console.log('[Notes] POST insert committed', { tenantId, conversationId, contactId, noteId: note.id });

    // Success Audit Trail (fire-and-forget, never blocks the response)
    logAudit({
      tenant_id: tenantId,
      actor_id: userId,
      actor_email: me.email,
      action: 'note_created' as any,
      entity: 'note',
      entity_id: note.id,
      new_value: { text: note.text },
    });

    console.log('[Notes] POST success', {
      tenantId,
      conversationId,
      contactId,
      userId,
      noteId: note.id,
      apiResponseStatus: 201,
    });

    return NextResponse.json(formatNote(note), { status: 201 });

  } catch (err: any) {
    console.error('[Notes] POST unexpected error', {
      tenantId,
      conversationId,
      contactId,
      userId,
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json({ success: false, code: 'NOTE_SAVE_FAILED', error: 'Internal Server Error' }, { status: 500 });
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
    // Check ownership — deleted notes cannot be edited
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('notes')
      .select('id, text, tenant_id')
      .eq('id', id)
      .eq('tenant_id', me.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (findErr || !existing) {
      console.warn('[Notes] PATCH rejected: not found or access denied', { tenantId: me.tenant_id, noteId: id });
      return NextResponse.json({ success: false, error: 'Note not found or access denied' }, { status: 404 });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('notes')
      .update({ text: sanitizedText })
      .eq('id', id)
      .eq('tenant_id', me.tenant_id)
      .select(NOTE_SELECT)
      .single();

    if (updateErr || !updated) {
      console.error('[Notes] PATCH update failed', { tenantId: me.tenant_id, noteId: id, error: updateErr?.message });
      return NextResponse.json({ success: false, code: 'NOTE_UPDATE_FAILED', error: updateErr?.message || 'Update failed' }, { status: 500 });
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

    console.log('[Notes] PATCH success', { tenantId: me.tenant_id, noteId: id });

    return NextResponse.json({ success: true, note: formatNote(updated) });

  } catch (err: any) {
    console.error('[Notes] PATCH unexpected error', { error: err.message, stack: err.stack });
    return NextResponse.json({ success: false, code: 'NOTE_UPDATE_FAILED', error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── DELETE: Soft-delete a note (deleted_at set, row + audit trail preserved) ──
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
    // Check ownership — already-deleted notes 404 (idempotent delete)
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('notes')
      .select('id, text, tenant_id')
      .eq('id', id)
      .eq('tenant_id', me.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (findErr || !existing) {
      console.warn('[Notes] DELETE rejected: not found or access denied', { tenantId: me.tenant_id, noteId: id });
      return NextResponse.json({ success: false, error: 'Note not found or access denied' }, { status: 404 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', me.tenant_id);

    if (deleteErr) {
      console.error('[Notes] DELETE failed', { tenantId: me.tenant_id, noteId: id, error: deleteErr.message });
      return NextResponse.json({ success: false, code: 'NOTE_DELETE_FAILED', error: deleteErr.message }, { status: 500 });
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

    console.log('[Notes] DELETE success', { tenantId: me.tenant_id, noteId: id });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[Notes] DELETE unexpected error', { error: err.message, stack: err.stack });
    return NextResponse.json({ success: false, code: 'NOTE_DELETE_FAILED', error: 'Internal Server Error' }, { status: 500 });
  }
}
