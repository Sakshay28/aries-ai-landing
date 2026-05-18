// ═══════════════════════════════════════════════════════════
// Agent Configs API — List & Create
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('agent_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    agent_name,
    agent_description = '',
    routing_keywords = [],
    bot_name = '',
    bot_personality = '',
    system_prompt = '',
    is_active = true,
  } = body;

  if (!agent_name) return NextResponse.json({ error: 'agent_name is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('agent_configs')
    .insert({
      tenant_id: tenantId,
      agent_name,
      agent_description,
      routing_keywords,
      bot_name,
      bot_personality,
      system_prompt,
      is_active,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data }, { status: 201 });
}
