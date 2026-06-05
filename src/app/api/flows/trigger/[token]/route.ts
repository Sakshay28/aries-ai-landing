// ═══════════════════════════════════════════════════════════
// 🔗 External Webhook Trigger for Automation Flows
// ═══════════════════════════════════════════════════════════
// Allows external systems to trigger a specific flow via HTTP.
// Each flow with a webhook_trigger node gets a unique URL:
//   POST /api/flows/trigger/<flow_id>
//   Header: x-aries-secret: <tenant webhook secret>  (optional but recommended)
//   Body: { "phone": "+919...", "variables": { ... } }
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { runFlowsForMessage } from '@/lib/flows/engine';

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: flowId } = await params;

  // 1. Load the flow and verify it has a webhook_trigger node
  const { data: flow, error } = await supabaseAdmin
    .from('automation_flows')
    .select('id, tenant_id, name, nodes, is_active')
    .eq('id', flowId)
    .single();

  if (error || !flow) {
    return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
  }

  if (!flow.is_active) {
    return NextResponse.json({ error: 'Flow is not active' }, { status: 400 });
  }

  const nodes = (flow.nodes as Array<{ type: string; data?: Record<string, unknown> }>) || [];
  const webhookNode = nodes.find(n => n.type === 'webhook_trigger');
  if (!webhookNode) {
    return NextResponse.json({ error: 'Flow does not have a webhook_trigger node' }, { status: 400 });
  }

  // 2. Optional secret validation
  const expectedSecret = webhookNode.data?.secret as string | undefined;
  if (expectedSecret) {
    const providedSecret =
      req.headers.get('x-aries-secret') ||
      req.headers.get('authorization')?.replace('Bearer ', '');
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }
  }

  // 3. Parse body — phone is required; variables are optional extra data
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phone = (body.phone as string || '').replace(/\D/g, '');
  if (!phone) {
    return NextResponse.json(
      { error: 'Missing "phone" in request body (e.g. "+919876543210")' },
      { status: 400 }
    );
  }

  // 4. Resolve or create a conversation for this phone number
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', flow.tenant_id)
    .eq('sender_id', phone)
    .eq('is_active', true)
    .maybeSingle();

  const conversationId = conv?.id;
  if (!conversationId) {
    return NextResponse.json(
      { error: `No active conversation found for phone ${phone}` },
      { status: 404 }
    );
  }

  // 5. Merge any extra variables from the request body into a trigger message
  const extraVars = (body.variables as Record<string, unknown>) || {};
  const triggerMessage = (body.message as string) || JSON.stringify(extraVars) || 'webhook_trigger';

  // 6. Run the flow — pass 'webhook' as messageType so trigger matching works
  try {
    const handled = await runFlowsForMessage(
      flow.tenant_id as string,
      triggerMessage,
      phone,
      conversationId,
      null,
      false,
      'webhook'
    );

    return NextResponse.json({
      ok: true,
      flowName: flow.name,
      handled,
    });
  } catch (e) {
    console.error(`Webhook trigger: flow ${flowId} failed:`, e);
    return NextResponse.json({ error: 'Flow execution error' }, { status: 500 });
  }
}

// Allow GET for testing / health check
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: flowId } = await params;
  const { data: flow } = await supabaseAdmin
    .from('automation_flows')
    .select('id, name, is_active')
    .eq('id', flowId)
    .single();

  if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, flowName: flow.name, active: flow.is_active });
}
