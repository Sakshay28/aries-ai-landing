import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

const VALID_TRIGGERS = ['booking_confirmed', 'new_lead', 'escalation_triggered', 'escalation_resolved', 'payment_received'];
const VALID_UNITS = ['minutes', 'hours', 'days'];

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = String(body.name).trim();
  if (body.trigger_event !== undefined) {
    if (!VALID_TRIGGERS.includes(body.trigger_event)) return NextResponse.json({ error: 'Invalid trigger_event' }, { status: 400 });
    allowed.trigger_event = body.trigger_event;
  }
  if (body.delay_value !== undefined) {
    if (typeof body.delay_value !== 'number' || body.delay_value < 0) return NextResponse.json({ error: 'delay_value must be >= 0' }, { status: 400 });
    allowed.delay_value = body.delay_value;
  }
  if (body.delay_unit !== undefined) {
    if (!VALID_UNITS.includes(body.delay_unit)) return NextResponse.json({ error: 'Invalid delay_unit' }, { status: 400 });
    allowed.delay_unit = body.delay_unit;
  }
  if (body.message_text !== undefined) allowed.message_text = String(body.message_text).trim();
  if (body.media_url !== undefined) allowed.media_url = body.media_url || null;
  if (body.media_type !== undefined) allowed.media_type = body.media_type || null;
  if (body.cancel_on_reply !== undefined) allowed.cancel_on_reply = !!body.cancel_on_reply;

  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('automations')
    .update(allowed)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ automation: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();
  if (!['active', 'paused'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('automations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === 'paused') {
    await supabaseAdmin
      .from('automation_queue')
      .update({ status: 'cancelled' })
      .eq('automation_id', id)
      .eq('status', 'pending');
  }

  return NextResponse.json({ automation: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('automations')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
