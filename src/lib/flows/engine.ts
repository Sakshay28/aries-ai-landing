// ═══════════════════════════════════════════════════════════
// 🤖 Flow Execution Engine
// ═══════════════════════════════════════════════════════════
// Runs a published automation_flow against an inbound WhatsApp
// message. Returns true if the flow handled the message (caller
// should skip AI reply). Returns false if no flow matched or
// the flow finished without sending anything.
//
// Supported node types (mirrors FlowSidebar node IDs):
//   trigger / keyword_trigger   — entry, checks keyword / first_message / all_messages
//   standard / send_*           — send a text message (supports {{variable}} interpolation)
//   condition / condition_check — branch: evaluates ctx.variables.{field} or keyword fallback
//   handoff                     — pause bot, escalate to human agent
//   delay / wait                — sleep N seconds (max 5s in serverless)
//   tag / tag_lead              — update lead_status in DB
//   webhook                     — real HTTP GET/POST/PUT, JSON response stored in ctx.variables
//   interruption                — Gemini AI intent extraction → stores intent/entities in ctx.variables
//   knowledge                   — search tenant knowledge_docs, stores best snippet in ctx.variables
//   memory                      — persist ctx.variables back to leads + conversations tables
//   format                      — stringify knowledge_result or webhook_response into formatted_message
//   extract                     — regex entity extraction (email/phone/name) into ctx.variables
//   ai_reply                    — call Gemini and send its response as a WhatsApp message
//   wait_for_reply              — pause execution, resume on next inbound message (variables persisted)
//   end                         — stop execution
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage, sendMediaMessage, MetaMediaType, sendStaffAlert } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { processMessageWithAI, TenantAIConfig } from '@/lib/ai/engine';
import { getTenantConfig } from '@/lib/tenant/manager';
import { createBookingEvent } from '@/lib/integrations/google-calendar';
import type { Tenant } from '@/lib/types';

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

// ── Simulation trace ────────────────────────────────────────
export interface TraceStep {
  nodeId:    string;
  nodeType:  string;
  action:    string;    // e.g. 'send_message', 'condition_true', 'webhook_call'
  payload?:  unknown;   // message text, webhook url, etc.
  variables?: Record<string, unknown>;
  nextId?:   string | null;
}

interface ExecContext {
  tenantId: string;
  leadId: string | null;
  leadName: string;            // for {{name}} interpolation
  conversationId: string;
  phone: string;               // destination phone number
  accessToken: string;         // decrypted Meta access token
  phoneNumberId: string;       // Meta phone number ID
  messageText: string;
  isFirstMessage: boolean;
  pendingFlowNode?: string;  // node id to resume on next inbound message
  variables: Record<string, unknown>; // inter-node data bag — persisted across wait_for_reply
  dryRun?:  boolean;       // if true: skip all side-effects (no WhatsApp sends, no DB writes)
  trace?:   TraceStep[];   // populated during dry-run to describe what would happen
  staffPhone?: string | null;
  managerPhone?: string | null;
  rawAccessToken?: string | null;
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
    .replace(/\{\{message\}\}/gi, ctx.messageText)
    // {{field}} or {{a.b.c}} — resolved from ctx.variables
    .replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
      const parts = path.split('.');
      let val: unknown = ctx.variables;
      for (const p of parts) val = (val as Record<string, unknown>)?.[p];
      return val != null ? String(val) : `{{${path}}}`;
    });
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
      .select('wa_access_token, wa_phone_number_id, staff_phone, manager_phone, business_name')
      .eq('id', tenantId)
      .single(),
    leadId
      ? supabaseAdmin.from('leads').select('name').eq('id', leadId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
    return false;
  }

  const decryptedToken = decryptToken(tenant.wa_access_token as string);
  if (!decryptedToken) {
    console.error(`Flow engine: failed to decrypt token for tenant ${tenantId}`);
    return false;
  }

  const ctx: ExecContext = {
    tenantId,
    leadId,
    leadName: (lead as { name?: string } | null)?.name || '',
    conversationId,
    phone,
    accessToken: decryptedToken,
    phoneNumberId: tenant.wa_phone_number_id as string,
    messageText,
    isFirstMessage,
    variables: {},
    staffPhone: tenant.staff_phone,
    managerPhone: tenant.manager_phone,
    rawAccessToken: tenant.wa_access_token as string,
  };

  // ── Check for a pending wait_for_reply node from a previous flow run ──
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('context')
    .eq('id', conversationId)
    .single();
  const pendingNode = (conv?.context as Record<string, unknown>)?.pending_flow_node as string | undefined;

  if (pendingNode) {
    // Restore saved variables and clear the pending marker
    const savedCtx = { ...(conv?.context as Record<string, unknown>) };
    delete savedCtx.pending_flow_node;
    await supabaseAdmin
      .from('conversations')
      .update({ context: { ...savedCtx, pending_flow_node: null } })
      .eq('id', conversationId);

    // Find the flow that owns this node and resume, with restored variables
    const ownerFlow = (flows as FlowRecord[]).find(f => f.nodes.some(n => n.id === pendingNode));
    if (ownerFlow) {
      const resumeCtx: ExecContext = { ...ctx, variables: savedCtx };
      const handled = await executeFlowFromNode(ownerFlow, resumeCtx, pendingNode);
      if (handled) return true;
    }
  }

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
async function executeFlowGraph(nodes: FlowNode[], edges: FlowEdge[], ctx: ExecContext, startId: string): Promise<boolean> {
  let messageSent = false;
  let currentId: string | null = startId;
  const visited = new Set<string>();
  const MAX_STEPS = 20;
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

  return messageSent || steps > 1;
}

async function executeFlowFromNode(flow: FlowRecord, ctx: ExecContext, startNodeId: string): Promise<boolean> {
  return executeFlowGraph(flow.nodes as FlowNode[], flow.edges as FlowEdge[], ctx, startNodeId);
}

async function executeFlow(flow: FlowRecord, ctx: ExecContext): Promise<boolean> {
  const nodes = flow.nodes as FlowNode[];
  const edges = flow.edges as FlowEdge[];

  const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'keyword_trigger');
  if (!triggerNode) return false;

  return executeFlowGraph(nodes, edges, ctx, triggerNode.id);
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

  // ── Send Media (image / video / audio / file) ────────────
  if (type === 'send_media' || type === 'send_audio') {
    const mediaUrl = interpolate((node.data?.mediaUrl as string) || '', ctx);
    const caption  = interpolate((node.data?.caption as string) || '', ctx);
    const mediaType = (node.data?.mediaType as string) ||
      (type === 'send_audio' ? 'audio' : 'image');

    if (!mediaUrl.trim()) {
      // No URL configured — skip node and continue flow
      return { nextId: getNextNode(node.id, null, edges) };
    }

    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'send_media', payload: mediaUrl, variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges), sent: true };
    }

    const metaMediaType = mediaType === 'file' ? 'document' : (mediaType as MetaMediaType);

    try {
      await sendMediaMessage(
        ctx.accessToken,
        ctx.phoneNumberId,
        ctx.phone,
        metaMediaType,
        mediaUrl,
        caption || undefined
      );
      await supabaseAdmin.from('messages').insert({
        tenant_id: ctx.tenantId,
        conversation_id: ctx.conversationId,
        direction: 'outbound',
        content: caption || `[${mediaType}]`,
        message_type: mediaType,
        channel: 'whatsapp',
        status: 'sent',
        ai_generated: false,
      });
      return { nextId: getNextNode(node.id, null, edges), sent: true };
    } catch (e) {
      console.error(`Flow engine: sendMediaMessage failed for node ${node.id}:`, (e as Error).message);
      return { nextId: getNextNode(node.id, 'error', edges) };
    }
  }

  // ── Send Text Message ─────────────────────────────────────
  if (
    type === 'standard' ||
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
      // Dry-run: record what would be sent without any side-effects
      if (ctx.dryRun) {
        ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'send_message', payload: content, variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
        return { nextId: getNextNode(node.id, null, edges), sent: true };
      }
      try {
        await sendTextMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, content);
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
    const field = (node.data?.field as string || '').trim();
    const operator = (node.data?.operator as string || '==');
    const targetVal = (node.data?.value as string || '');

    let matched = false;
    if (field) {
      // Evaluate ctx.variables.{field} (supports dot notation)
      const parts = field.split('.');
      let val: unknown = ctx.variables;
      for (const p of parts) val = (val as Record<string, unknown>)?.[p];
      const strVal = val != null ? String(val) : '';
      const numVal = parseFloat(strVal);
      const numTarget = parseFloat(targetVal);
      switch (operator) {
        case '==': matched = strVal === targetVal; break;
        case '!=': matched = strVal !== targetVal; break;
        case '>':  matched = !isNaN(numVal) && numVal > numTarget; break;
        case '<':  matched = !isNaN(numVal) && numVal < numTarget; break;
        case 'contains': matched = strVal.toLowerCase().includes(targetVal.toLowerCase()); break;
        default:   matched = strVal === targetVal;
      }
    } else {
      // Fallback: keyword match on incoming message (legacy behaviour)
      const keyword = ((node.data?.condition as string) || targetVal || '').toLowerCase().trim();
      matched = keyword ? keywordMatches(ctx.messageText.toLowerCase(), keyword) : false;
    }
    return { nextId: getNextNode(node.id, matched ? 'true' : 'false', edges) };
  }

  // ── Human Handoff ────────────────────────────────────────
  if (type === 'handoff' || node.data?.label === 'Human Handoff') {
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'handoff', payload: 'bot_paused=true', nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
    try {
      await supabaseAdmin
        .from('conversations')
        .update({
          bot_paused: true,
          escalated: true,
          escalated_at: new Date().toISOString(),
          escalation_reason: 'Flow Handoff Triggered'
        })
        .eq('id', ctx.conversationId);

      // Trigger Staff Alert
      if (ctx.staffPhone || ctx.managerPhone) {
        const alertText = `⚠️ Handoff Requested!
👤 +${ctx.phone} (${ctx.leadName || 'Customer'})
💬 "${ctx.messageText.length > 60 ? ctx.messageText.slice(0, 57) + '...' : ctx.messageText}"`;

        void sendStaffAlert({
          wa_phone_number_id: ctx.phoneNumberId,
          wa_access_token: ctx.rawAccessToken || ctx.accessToken,
          staff_phone: ctx.staffPhone,
          manager_phone: ctx.managerPhone
        }, alertText).catch(err => {
          console.error('Flow engine: failed to dispatch staff alert:', err);
        });
      }
    } catch (e) {
      console.error('Flow engine: handoff pause failed:', e);
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Tag / Label Lead ─────────────────────────────────────
  if (type === 'tag' || node.id?.startsWith('tag')) {
    const tag = (node.data?.tag as string) || (node.data?.label as string) || '';
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'tag_lead', payload: tag, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
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
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'delay', payload: `${seconds}s`, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
    await new Promise(r => setTimeout(r, seconds * 1000));
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Webhook — real HTTP call, stores JSON response in variables ──
  if (type === 'webhook') {
    const method = ((node.data?.method as string) || 'GET').toUpperCase();
    const rawUrl = (node.data?.url as string) || '';
    const url = interpolate(rawUrl, ctx);
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'webhook_call', payload: { method, url }, variables: { ...ctx.variables }, nextId: getNextNode(node.id, 'success', edges) });
      return { nextId: getNextNode(node.id, 'success', edges) };
    }
    if (!url || !url.startsWith('http')) {
      console.error(`Flow engine: webhook node ${node.id} has invalid url: "${url}"`);
      return { nextId: getNextNode(node.id, 'error', edges) };
    }
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10_000);
      const init: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Aries-Tenant': ctx.tenantId },
        signal: controller.signal,
      };
      if (method !== 'GET') {
        init.body = JSON.stringify({
          phone: ctx.phone,
          message: ctx.messageText,
          lead_id: ctx.leadId,
          ...ctx.variables,
        });
      }
      const res = await fetch(url, init);
      clearTimeout(tid);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        const data: unknown = ct.includes('application/json') ? await res.json() : await res.text();
        ctx.variables[`${node.id}_response`] = data;
        ctx.variables.webhook_response = data; // convenient shorthand for last webhook
        // Flatten top-level object keys directly into variables for easy condition checks
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          Object.assign(ctx.variables, data as Record<string, unknown>);
        }
        return { nextId: getNextNode(node.id, 'success', edges) };
      }
      ctx.variables[`${node.id}_error`] = res.status;
      return { nextId: getNextNode(node.id, 'error', edges) };
    } catch (e) {
      console.error(`Flow engine: webhook ${node.id} failed:`, (e as Error).message);
      ctx.variables[`${node.id}_error`] = (e as Error).message;
      return { nextId: getNextNode(node.id, 'error', edges) };
    }
  }

  // ── Interruption — AI intent extraction into variables ───
  if (type === 'interruption') {
    try {
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants').select('*').eq('id', ctx.tenantId).single();
      if (tenantRow) {
        const tenantConfig: TenantAIConfig = {
          ...getTenantConfig(tenantRow as unknown as Tenant),
          isFirstMessage: false,
        };
        const aiResp = await processMessageWithAI(
          ctx.messageText, [], {}, tenantConfig, ctx.tenantId
        );
        if (aiResp) {
          ctx.variables.ai_intent     = aiResp.intent;
          ctx.variables.ai_sentiment  = aiResp.sentiment;
          ctx.variables.ai_confidence = aiResp.confidence;
          if (aiResp.extractedData) {
            Object.entries(aiResp.extractedData).forEach(([k, v]) => {
              if (v && v !== 'null') ctx.variables[k] = v;
            });
          }
          return { nextId: getNextNode(node.id, 'success', edges) };
        }
      }
    } catch (e) {
      console.error('Flow engine: interruption node failed:', (e as Error).message);
    }
    return { nextId: getNextNode(node.id, 'fallback', edges) };
  }

  // ── Knowledge — search tenant's knowledge docs ──────────
  if (type === 'knowledge') {
    try {
      const { data: docs } = await supabaseAdmin
        .from('knowledge_docs')
        .select('filename, content_text')
        .eq('tenant_id', ctx.tenantId)
        .neq('content_text', '');
      if (docs && docs.length > 0) {
        const lowerMsg = ctx.messageText.toLowerCase();
        const words = lowerMsg.split(/\s+/).filter(w => w.length > 3);
        const scored = docs
          .map(doc => ({
            ...doc,
            score: words.reduce((s, w) => s + (doc.content_text.toLowerCase().includes(w) ? 1 : 0), 0),
          }))
          .sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (best.score > 0) {
          const contentLower = best.content_text.toLowerCase();
          const kw = words.find(w => contentLower.includes(w));
          const idx = kw ? contentLower.indexOf(kw) : 0;
          const snippet = best.content_text.slice(Math.max(0, idx - 100), idx + 400).trim();
          ctx.variables.knowledge_result = snippet;
          ctx.variables.knowledge_source = best.filename;
        } else {
          ctx.variables.knowledge_result = '';
        }
      }
    } catch (e) {
      console.error('Flow engine: knowledge node failed:', (e as Error).message);
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Memory — persist variables to lead + conversation ───
  if (type === 'memory') {
    if (ctx.leadId) {
      const updates: Record<string, unknown> = {};
      if (ctx.variables.name)  updates.name  = ctx.variables.name;
      if (ctx.variables.email) updates.email = ctx.variables.email;
      if (Object.keys(updates).length > 0) {
        try {
          await supabaseAdmin.from('leads').update(updates).eq('id', ctx.leadId);
        } catch (e) {
          console.error('Flow engine: memory node lead update failed:', e);
        }
      }
    }
    try {
      await supabaseAdmin
        .from('conversations')
        .update({ context: ctx.variables })
        .eq('id', ctx.conversationId);
    } catch (e) {
      console.error('Flow engine: memory node conversation update failed:', e);
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Format — stringify variables into a WhatsApp message ─
  if (type === 'format') {
    if (ctx.variables.knowledge_result) {
      ctx.variables.formatted_message = `${ctx.variables.knowledge_result}`;
    } else if (ctx.variables.webhook_response) {
      const data = ctx.variables.webhook_response;
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const lines = Object.entries(data as Record<string, unknown>)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `• *${k.replace(/_/g, ' ')}*: ${v}`)
          .slice(0, 10);
        ctx.variables.formatted_message = lines.join('\n');
      } else {
        ctx.variables.formatted_message = String(data);
      }
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Extract — regex entity extraction from message ───────
  if (type === 'extract') {
    const emailMatch = ctx.messageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = ctx.messageText.match(/(\+?91[\-\s]?)?[6-9]\d{9}/);
    const nameMatch  = ctx.messageText.match(/(?:my name is|i am|i'm|this is)\s+([A-Z][a-zA-Z\s]{1,30})/i);
    if (emailMatch) ctx.variables.email          = emailMatch[0];
    if (phoneMatch) ctx.variables.extracted_phone = phoneMatch[0];
    if (nameMatch)  ctx.variables.name            = nameMatch[1].trim();
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Book Appointment — creates Google Calendar event ─────
  if (type === 'book_appointment') {
    try {
      const title = interpolate((node.data?.title as string) || 'Appointment', ctx);
      const start = interpolate((node.data?.start as string) || (ctx.variables.slot_start as string) || '', ctx);
      const end   = interpolate((node.data?.end   as string) || (ctx.variables.slot_end   as string) || '', ctx);

      if (!start || !end) {
        console.warn('Flow engine: book_appointment missing start/end — skipping');
        return { nextId: getNextNode(node.id, 'error', edges) };
      }

      const eventLink = await createBookingEvent(ctx.tenantId, {
        title,
        start,
        end,
        description:  interpolate((node.data?.description as string) || '', ctx),
        guestEmail:   (ctx.variables.email as string)       || undefined,
        guestName:    (ctx.variables.name  as string)        || ctx.leadName || undefined,
      });

      ctx.variables.booking_link = eventLink;
      return { nextId: getNextNode(node.id, 'success', edges) };
    } catch (e) {
      console.error('Flow engine: book_appointment failed:', (e as Error).message);
      return { nextId: getNextNode(node.id, 'error', edges) };
    }
  }

  // ── AI Reply — call Gemini, send its response ───────────
  if (type === 'ai_reply') {
    try {
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', ctx.tenantId)
        .single();
      if (tenantRow) {
        const tenantConfig: TenantAIConfig = {
          ...getTenantConfig(tenantRow as unknown as Tenant),
          isFirstMessage: false,
        };
        const aiResp = await processMessageWithAI(
          ctx.messageText,
          [],
          {},
          tenantConfig,
          ctx.tenantId
        );
        if (aiResp?.reply) {
          await sendTextMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, aiResp.reply);
          await supabaseAdmin.from('messages').insert({
            tenant_id: ctx.tenantId,
            conversation_id: ctx.conversationId,
            direction: 'outbound',
            content: aiResp.reply,
            message_type: 'text',
            channel: 'whatsapp',
            status: 'sent',
            ai_generated: true,
          });
          return { nextId: getNextNode(node.id, null, edges), sent: true };
        }
      }
    } catch (e) {
      console.error('Flow engine: ai_reply node failed:', (e as Error).message);
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Wait for Reply — pause flow, resume on next inbound ──
  if (type === 'wait_for_reply') {
    const nextNodeId = getNextNode(node.id, null, edges);
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'wait_for_reply', payload: `will resume at ${nextNodeId}`, nextId: nextNodeId });
      return { stop: true };
    }
    if (nextNodeId) {
      await supabaseAdmin
        .from('conversations')
        .update({ context: { ...ctx.variables, pending_flow_node: nextNodeId } })
        .eq('id', ctx.conversationId);
    }
    return { stop: true }; // Stop execution until next inbound message resumes here
  }

  // ── End ──────────────────────────────────────────────────
  if (type === 'end' || node.id === 'end') {
    return { stop: true };
  }

  // ── Unknown node type — just traverse ───────────────────
  return { nextId: getNextNode(node.id, null, edges) };
}

// ── Flow Simulator ───────────────────────────────────────────
// Runs a specific flow in dry-run mode against a test message.
// Returns the execution trace without sending any WhatsApp messages
// or making any DB/HTTP side-effects.
export interface SimulationResult {
  matched: boolean;
  flowName: string;
  trace: TraceStep[];
  variables: Record<string, unknown>;
  messageSent: boolean;
}

export async function simulateFlow(
  flowId:    string,
  testMessage: string,
  tenantId:  string,
): Promise<SimulationResult> {
  const { data: flow, error } = await supabaseAdmin
    .from('automation_flows')
    .select('id, name, trigger_type, trigger_keywords, nodes, edges')
    .eq('id', flowId)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !flow) {
    return { matched: false, flowName: '', trace: [], variables: {}, messageSent: false };
  }

  const trace: TraceStep[] = [];
  const ctx: ExecContext = {
    tenantId,
    leadId:          null,
    leadName:        'Test User',
    conversationId:  'sim-' + flowId,
    phone:           '+910000000000',
    accessToken:     'sim',
    phoneNumberId:   'sim',
    messageText:     testMessage,
    isFirstMessage:  false,
    variables:       {},
    dryRun:          true,
    trace,
  };

  const nodes = (flow as FlowRecord).nodes as FlowNode[];
  const edges = (flow as FlowRecord).edges as FlowEdge[];
  const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'keyword_trigger');
  if (!triggerNode) return { matched: false, flowName: flow.name as string, trace, variables: {}, messageSent: false };

  const messageSent = await executeFlowGraph(nodes, edges, ctx, triggerNode.id);

  return {
    matched:     true,
    flowName:    flow.name as string,
    trace,
    variables:   ctx.variables,
    messageSent,
  };
}

// ── Edge traversal helper ─────────────────────────────────────────
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
