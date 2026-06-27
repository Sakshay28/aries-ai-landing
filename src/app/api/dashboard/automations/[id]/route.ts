import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import {
  VALID_TRIGGERS, validateDelay, validateAbSplit, validateFreqCap, validateConditions,
} from '@/lib/automations/validate';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = user.tenant_id;

  const { id } = await params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = String(body.name).trim();
  if (body.trigger_event !== undefined) {
    if (!VALID_TRIGGERS.includes(body.trigger_event)) return NextResponse.json({ error: 'Invalid trigger_event' }, { status: 400 });
    allowed.trigger_event = body.trigger_event;
  }
  // Delay: validate the pair together so the 90-day ceiling is enforced even if
  // only one of value/unit is being changed (fall back to the other's incoming value).
  if (body.delay_value !== undefined || body.delay_unit !== undefined) {
    const delayErr = validateDelay(
      body.delay_value !== undefined ? body.delay_value : 0,
      body.delay_unit !== undefined ? body.delay_unit : 'minutes',
    );
    if (delayErr) return NextResponse.json({ error: delayErr }, { status: 400 });
    if (body.delay_value !== undefined) allowed.delay_value = body.delay_value;
    if (body.delay_unit !== undefined) allowed.delay_unit = body.delay_unit;
  }
  if (body.message_text !== undefined) allowed.message_text = String(body.message_text).trim();

  if (body.ab_split_percent !== undefined) {
    const abErr = validateAbSplit(body.ab_split_percent);
    if (abErr) return NextResponse.json({ error: abErr }, { status: 400 });
    allowed.ab_split_percent = body.ab_split_percent;
  }
  if (body.message_text_b !== undefined) allowed.message_text_b = body.message_text_b ? String(body.message_text_b).trim() : null;

  if (body.max_per_lead_per_day !== undefined) {
    const freqErr = validateFreqCap(body.max_per_lead_per_day);
    if (freqErr) return NextResponse.json({ error: freqErr }, { status: 400 });
    allowed.max_per_lead_per_day = body.max_per_lead_per_day ?? null;
  }
  if (body.conditions !== undefined) {
    const cond = validateConditions(body.conditions);
    if (cond.error) return NextResponse.json({ error: cond.error }, { status: 400 });
    allowed.conditions = cond.value;
  }
  if (body.fallback_template_name !== undefined) {
    allowed.fallback_template_name = body.fallback_template_name ? String(body.fallback_template_name).trim() : null;
  }
  if (body.media_url !== undefined) allowed.media_url = body.media_url || null;
  if (body.media_type !== undefined) allowed.media_type = body.media_type || null;
  if (body.cancel_on_reply !== undefined) allowed.cancel_on_reply = !!body.cancel_on_reply;

  allowed.updated_at = new Date().toISOString();
  allowed.updated_by = user.id;

  const { data, error } = await supabaseAdmin
    .from('automations')
    .update(allowed)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ automation: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = user.tenant_id;

  const { id } = await params;
  const { status } = await req.json();
  if (!['active', 'paused'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('automations')
    .update({ status, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select('id, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pausing cancels everything still waiting to send.
  if (status === 'paused') {
    await supabaseAdmin
      .from('automation_queue')
      .update({ status: 'cancelled', error_message: 'Automation paused' })
      .eq('automation_id', id)
      .eq('status', 'pending');
  }

  return NextResponse.json({ automation: data });
}

// Soft delete (H7/M10): the row and its execution history survive so the
// "Execution history" view keeps showing past sends. Pending queue items are
// cancelled so nothing fires for a deleted automation.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = user.tenant_id;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('automations')
    .update({ deleted_at: new Date().toISOString(), status: 'paused', updated_by: user.id })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabaseAdmin
    .from('automation_queue')
    .update({ status: 'cancelled', error_message: 'Automation deleted' })
    .eq('automation_id', id)
    .eq('status', 'pending');

  return NextResponse.json({ success: true });
}
