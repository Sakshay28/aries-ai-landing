// GET /api/dashboard/leads/[id]/timeline
// Returns the full score timeline for a lead — every signal event with
// timestamps, points, and reasoning. Powers the "Why?" explainability panel.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: leadId } = await params;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '100'), 200);

  // Verify lead belongs to tenant
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, lead_score, lead_status, auto_status, manual_status, scoring_reasoning, score_breakdown, buying_signals, negative_signals')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Signal events (immutable audit log)
  const { data: events } = await supabaseAdmin
    .from('lead_signal_events')
    .select('id, signal, label, points, score_before, score_after, category, source, conversation_id, metadata, created_at')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(limit);

  // Status history
  const { data: statusHistory } = await supabaseAdmin
    .from('lead_status_history')
    .select('id, from_status, to_status, trigger, reason, created_at')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    lead: {
      id:               leadId,
      lead_score:       lead.lead_score,
      lead_status:      lead.lead_status,
      auto_status:      lead.auto_status,
      manual_status:    lead.manual_status,
      scoring_reasoning: lead.scoring_reasoning,
      buying_signals:   lead.buying_signals,
      negative_signals: lead.negative_signals,
    },
    signal_events:  events ?? [],
    status_history: statusHistory ?? [],
  });
}
