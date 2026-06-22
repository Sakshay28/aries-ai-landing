import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

const VALID_TRIGGERS = ['booking_confirmed', 'booking_reminder', 'new_lead', 'escalation_triggered', 'escalation_resolved', 'payment_received'];
const VALID_UNITS = ['minutes', 'hours', 'days'];

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('automations')
    .select('id, name, trigger_event, delay_value, delay_unit, message_text, media_url, media_type, status, cancel_on_reply, customers_reached, messages_sent, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: data || [] });
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, trigger_event, delay_value, delay_unit, message_text, media_url, media_type, cancel_on_reply } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!VALID_TRIGGERS.includes(trigger_event)) return NextResponse.json({ error: 'Invalid trigger_event' }, { status: 400 });
  if (!message_text?.trim()) return NextResponse.json({ error: 'message_text is required' }, { status: 400 });
  if (delay_value != null && (typeof delay_value !== 'number' || delay_value < 0)) {
    return NextResponse.json({ error: 'delay_value must be >= 0' }, { status: 400 });
  }
  if (delay_unit && !VALID_UNITS.includes(delay_unit)) {
    return NextResponse.json({ error: 'Invalid delay_unit' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('automations')
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      trigger_event,
      delay_value: delay_value ?? 0,
      delay_unit: delay_unit || 'minutes',
      message_text: message_text.trim(),
      media_url: media_url || null,
      media_type: media_type || null,
      cancel_on_reply: cancel_on_reply ?? true,
      status: 'active',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation: data }, { status: 201 });
}
