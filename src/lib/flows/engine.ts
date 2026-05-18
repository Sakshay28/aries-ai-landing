// ═══════════════════════════════════════════════════════════
// 🤖 Flow Execution Engine
// ═══════════════════════════════════════════════════════════
// Runs a published automation_flow against an inbound WhatsApp
// message. Returns true if the flow handled the message (caller
// should skip AI reply). Returns false if no flow matched or
// the flow finished without sending anything.
//
// Supported node types (mirrors FlowSidebar node IDs):
//   trigger / keyword_trigger  — entry, checks keyword match
//   standard / send_*          — send text message
//   condition / condition_check — branch on keyword match
//   handoff                    — pause bot (escalate to human)
//   delay / wait               — sleep N seconds (max 5s in serverless)
//   tag_lead (tag)             — update lead_status / tag
//   end                        — stop execution
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage } from '@/lib/gupshup/service';
import { decryptToken } from '@/lib/utils/crypto';

// ── Types ────────────────────────────────────────────────────
interface FlowNode {
  id: string;
  type: string;
  data: Record<string, string | number | boolean | undefined>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

interface FlowRecord {
  id: string;
  name: string;
  trigger_type: string;
  trigger_keywords: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface ExecContext {
  tenantId: string;
  leadId: string | null;
  leadName: string;            // for {{name}} interpolation
  conversationId: string;
  phone: string;               // destination phone number
  apiKey: string;              // decrypted Gupshup API key
  appPhone: string;            // Gupshup source phone
  appName: string;             // Gupshup app name
  messageText: string;
  isFirstMessage: boolean;
}

// ── Fuzzy keyword match: word-boundary aware ─────────────────
// "book" matches "booking", "booked", "wanna book" but NOT "facebook"
function keywordMatches(text: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  // Escape special regex chars
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match at word boundary or start/end of string
  return new RegExp(`(^|\\s|[^a-z])${escaped}`, 'i').test(text);
}

// ── Interpolate {{variables}} in message text ─────────────────
function interpolate(template: string, ctx: ExecContext): string {
  return template
    .replace(/\{\{name\}\}/gi, ctx.leadName || 'there')
    .replace(/\{\{phone\}\}/gi, ctx.phone)
    .replace(/\{\{message\}\}/gi, ctx.messageText);
}

// ── Main entry point ─────────────────────────────────────────
/**
 * Checks all active flows for the tenant and runs the first
 * matching one. Returns true if a flow ran and sent at least
 * one message (caller should skip Gemini AI reply).
 */
export async function runFlowsForMessage(
  tenantId: string,
  messageText: string,
  phone: string,
  conversationId: string,
  leadId: string | null,
  isFirstMessage = false
): Promise<boolean> {
  // Fetch active flows for this tenant
  const { data: flows, error } = await supabaseAdmin
    .from('automation_flows')
    .select('id, name, trigger_type, trigger_keywords, nodes, edges')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (error || !flows || flows.length === 0) return false;

  // Load tenant credentials + lead name in parallel
  const [{ data: tenant }, { data: lead }] = await Promise.all([
    supabaseAdmin
      .from('tenants')
      .select('gupshup_api_key, gupshup_phone_number, gupshup_app_name')
      .eq('id', tenantId)
      .single(),
    leadId
      ? supabaseAdmin.from('leads').select('name').eq('id', leadId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!tenant?.gupshup_api_key || !tenant?.gupshup_phone_number || !tenant?.gupshup_app_name) {
    return false;
  }

  const ctx: ExecContext = {
    tenantId,
    leadId,
    leadName: (lead as { name?: string } | null)?.name || '',
    conversationId,
    phone,
    apiKey: decryptToken(tenant.gupshup_api_key as string) as string,
    appPhone: tenant.gupshup_phone_number as string,
    appName: tenant.gupshup_app_name as string,
    messageText,
    isFirstMessage,
  };

  const lowerMsg = messageText.toLowerCase().trim();

  // Sort flows: most specific (most keywords) first so targeted flows win
  const sorted = [...(flows as FlowRecord[])].sort(
    (a, b) => (b.trigger_keywords?.length ?? 0) - (a.trigger_keywords?.length ?? 0)
  );

  for (const flow of sorted) {
    if (triggerMatches(flow, lowerMsg, isFirstMessage)) {
      const handled = await executeFlow(flow, ctx);
      if (handled) return true;
    }
  }

  return false;
}

// ── Trigger matching ─────────────────────────────────────────
function triggerMatches(flow: FlowRecord, lowerMsg: string, isFirstMessage: boolean): boolean {
  switch (flow.trigger_type) {
    case 'all_messages':
      return true;
    case 'first_message':
      return isFirstMessage;
    case 'new_lead':
      return false; // handled by lead creation hook, not here
    case 'keyword':
    default: {
      if (!flow.trigger_keywords || flow.trigger_keywords.length === 0) return true;
      // Fuzzy word-boundary match: "book" hits "booking" but not "facebook"
      return flow.trigger_keywords.some(kw => keywordMatches(lowerMsg, kw));
    }
  }
}

// ── Flow graph traversal ─────────────────────────────────────
async function executeFlow(flow: FlowRecord, ctx: ExecContext): Promise<boolean> {
  const nodes = flow.nodes as FlowNode[];
  const edges = flow.edges as FlowEdge[];

  // Find trigger node (the entry point)
  const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'keyword_trigger');
  if (!triggerNode) return false;

  let messageSent = false;
  let currentId: string | null = triggerNode.id;
  const visited = new Set<string>();
  const MAX_STEPS = 20; // prevent infinite loops
  let steps = 0;

  while (currentId && steps < MAX_STEPS) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    steps++;

    const node = nodes.find(n => n.id === currentId);
    if (!node) break;

    const result = await executeNode(node, ctx, edges, nodes);

    if (result.stop) break;
    if (result.sent) messageSent = true;

    currentId = result.nextId ?? null;
  }

  return messageSent;
}

interface StepResult {
  nextId?: string;
  stop?: boolean;
  sent?: boolean;
}

async function executeNode(
  node: FlowNode,
  ctx: ExecContext,
  edges: FlowEdge[],
  nodes: FlowNode[]
): Promise<StepResult> {
  const type = node.type;

  // ── Trigger — just pass through ──────────────────────────
  if (type === 'trigger' || type === 'keyword_trigger') {
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Send Message ─────────────────────────────────────────
  if (
    type === 'standard' ||
    type === 'send_media' ||
    type === 'send_audio' ||
    type === 'send_location' ||
    type === 'send_buttons' ||
    type === 'send_list' ||
    type === 'send_quick_replies' ||
    type === 'collect_input' ||
    type === 'ask_question' ||
    type === 'format'
  ) {
    const raw = (node.data?.content as string) || (node.data?.message as string) || '';
    const content = interpolate(raw, ctx);
    if (content.trim()) {
      try {
        await sendTextMessage(ctx.apiKey, ctx.appPhone, ctx.phone, content, ctx.appName);
        // Record the outbound message in DB
        await supabaseAdmin.from('messages').insert({
          tenant_id: ctx.tenantId,
          conversation_id: ctx.conversationId,
          direction: 'outbound',
          content,
          message_type: 'text',
          channel: 'whatsapp',
          status: 'sent',
          ai_generated: false,
        });
        return { nextId: getNextNode(node.id, null, edges), sent: true };
      } catch (e) {
        console.error(`Flow engine: sendTextMessage failed for node ${node.id}:`, (e as Error).message);
        return { nextId: getNextNode(node.id, 'error', edges) };
      }
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Condition / Branch ───────────────────────────────────
  if (type === 'condition' || type === 'condition_check') {
    const keyword = ((node.data?.condition as string) || (node.data?.keyword as string) || '').toLowerCase().trim();
    const matched = keyword ? keywordMatches(ctx.messageText.toLowerCase(), keyword) : false;
    const handle = matched ? 'true' : 'false';
    return { nextId: getNextNode(node.id, handle, edges) };
  }

  // ── Human Handoff ────────────────────────────────────────
  if (type === 'handoff' || node.data?.label === 'Human Handoff') {
    try {
      await supabaseAdmin
        .from('conversations')
        .update({ bot_paused: true })
        .eq('id', ctx.conversationId);
    } catch (e) {
      console.error('Flow engine: handoff pause failed:', e);
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Tag / Label Lead ─────────────────────────────────────
  if (type === 'tag' || node.id?.startsWith('tag')) {
    const tag = (node.data?.tag as string) || (node.data?.label as string) || '';
    if (tag && ctx.leadId) {
      try {
        await supabaseAdmin
          .from('leads')
          .update({ lead_status: tag.toLowerCase() })
          .eq('id', ctx.leadId);
      } catch (e) {
        console.error('Flow engine: tag lead failed:', e);
      }
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Delay / Wait ─────────────────────────────────────────
  if (type === 'delay' || type === 'wait') {
    const seconds = Math.min(Number(node.data?.seconds ?? node.data?.delay ?? 1), 5);
    await new Promise(r => setTimeout(r, seconds * 1000));
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── End ──────────────────────────────────────────────────
  if (type === 'end' || node.id === 'end') {
    return { stop: true };
  }

  // ── Unknown node type — just traverse ───────────────────
  return { nextId: getNextNode(node.id, null, edges) };
}

// ── Edge traversal helper ─────────────────────────────────────
function getNextNode(
  sourceId: string,
  handle: string | null,
  edges: FlowEdge[]
): string | undefined {
  // Match on sourceHandle if provided, otherwise take first edge from source
  const match = edges.find(e =>
    e.source === sourceId &&
    (handle === null || !e.sourceHandle || e.sourceHandle === handle)
  );
  return match?.target;
}
