import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import {
  VALID_TRIGGERS, validateDelay, validateAbSplit, validateFreqCap, validateConditions,
} from '@/lib/automations/validate';

const SELECT_COLUMNS =
  'id, name, trigger_event, delay_value, delay_unit, message_text, message_text_b, ab_split_percent, ' +
  'media_url, media_type, status, cancel_on_reply, conditions, max_per_lead_per_day, fallback_template_name, ' +
  'customers_reached, messages_sent, created_at, updated_at';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('automations')
    .select(SELECT_COLUMNS)
    .eq('tenant_id', user.tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = user.tenant_id;

  const body = await req.json();
  const {
    name, trigger_event, delay_value, delay_unit, message_text,
    message_text_b, ab_split_percent, media_url, media_type, cancel_on_reply,
    conditions, max_per_lead_per_day, fallback_template_name, force,
  } = body;

  // ── Field validation ──
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!VALID_TRIGGERS.includes(trigger_event)) return NextResponse.json({ error: 'Invalid trigger_event' }, { status: 400 });
  if (!message_text?.trim()) return NextResponse.json({ error: 'message_text is required' }, { status: 400 });

  const delayErr = validateDelay(delay_value, delay_unit);
  if (delayErr) return NextResponse.json({ error: delayErr }, { status: 400 });

  const abErr = validateAbSplit(ab_split_percent);
  if (abErr) return NextResponse.json({ error: abErr }, { status: 400 });
  // A/B requires a B variant to be present when a split is set
  if ((ab_split_percent ?? 0) > 0 && !message_text_b?.trim()) {
    return NextResponse.json({ error: 'message_text_b is required when ab_split_percent > 0' }, { status: 400 });
  }

  const freqErr = validateFreqCap(max_per_lead_per_day);
  if (freqErr) return NextResponse.json({ error: freqErr }, { status: 400 });

  const cond = validateConditions(conditions);
  if (cond.error) return NextResponse.json({ error: cond.error }, { status: 400 });

  // ── L1: duplicate detection (unless force=true) ──
  if (!force) {
    const { data: dupes } = await supabaseAdmin
      .from('automations')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('trigger_event', trigger_event)
      .eq('message_text', message_text.trim())
      .is('deleted_at', null)
      .limit(1);
    if (dupes && dupes.length > 0) {
      return NextResponse.json(
        { error: 'duplicate', message: `An automation with the same trigger and message already exists ("${dupes[0].name}").`, duplicateOf: dupes[0].id },
        { status: 409 },
      );
    }
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
      message_text_b: message_text_b?.trim() || null,
      ab_split_percent: ab_split_percent ?? 0,
      media_url: media_url || null,
      media_type: media_type || null,
      cancel_on_reply: cancel_on_reply ?? true,
      conditions: cond.value,
      max_per_lead_per_day: max_per_lead_per_day ?? null,
      fallback_template_name: fallback_template_name?.trim() || null,
      status: 'active',
      created_by: user.id,
      updated_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation: data }, { status: 201 });
}
