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
import { getRedisClient } from '@/lib/redis/client';
import { sendTextMessage, sendMediaMessage, sendInteractiveButtonsMessage, sendInteractiveListMessage, MetaMediaType } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { processMessageWithAI, TenantAIConfig } from '@/lib/ai/engine';
import { getTenantConfig } from '@/lib/tenant/manager';
import { createBookingEvent } from '@/lib/integrations/google-calendar';
import { sendFlowEmail } from '@/lib/email/service';
import type { Tenant } from '@/lib/types';
import { getFlowVariables } from './variables';

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
  messageType?: string;        // "text" | "interactive" | "button" — for button_trigger matching
  buttonId?: string;           // raw button reply id from Meta (interactive/button messages)
  isFromAd?: boolean;          // true when message arrived via a CTWA (Click-to-WhatsApp) ad
  referral?: {                 // Meta ad referral data (populated when isFromAd=true)
    source_id?: string;
    source_type?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
    source_url?: string;
  };
  pendingFlowNode?: string;    // node id to resume on next inbound message
  variables: Record<string, unknown>; // inter-node data bag — persisted across wait_for_reply
  dryRun?:  boolean;       // if true: skip all side-effects (no WhatsApp sends, no DB writes)
  trace?:   TraceStep[];   // populated during dry-run to describe what would happen
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
  isFirstMessage = false,
  messageType = 'text',
  buttonId?: string,
  referral?: {
    source_id?: string;
    source_type?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
    source_url?: string;
  }
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
      .select('wa_access_token, wa_phone_number_id, business_name')
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

  const isFromAd = !!referral && referral.source_type === 'ad';

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
    messageType,
    buttonId,
    isFromAd,
    referral,
    variables: {
      wa_name: (lead as { name?: string } | null)?.name || 'there',
      wa_phone: phone,
      tenant_name: tenant?.business_name || 'Business',
      current_date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      current_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      language: 'en',
      last_message: messageText,
      conversation_id: conversationId,
      // Ad variables — populated when message comes from a Meta CTWA ad
      ...(isFromAd && referral && {
        ad_source_id:  referral.source_id  || '',
        ad_headline:   referral.headline   || '',
        ad_body:       referral.body       || '',
        ad_source_url: referral.source_url || '',
        ad_ctwa_clid:  referral.ctwa_clid  || '',
      }),
    },
  };

  // ── Check for a pending wait_for_reply node from a previous flow run ──
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('context, current_step')
    .eq('id', conversationId)
    .single();
  const pendingNode = (conv?.context as Record<string, unknown>)?.pending_flow_node as string | undefined;

  // Determine whether an active booking/workflow is in progress.
  // all_messages flows must NOT fire mid-booking — they would inject messages into
  // an ongoing AI-driven collection sequence (guest count → date → time → name → phone).
  const convCtx = (conv?.context as Record<string, unknown>) || {};
  const bookingState = convCtx.booking_state as Record<string, unknown> | undefined;
  const hasActiveWorkflow = !!(
    convCtx.pending_flow_node ||
    convCtx.booking_saved ||
    (bookingState && Object.values(bookingState).some(v => v != null && v !== '')) ||
    (conv?.current_step &&
      !['greeting', 'completed', 'escalated', 'ask_intent'].includes(conv.current_step as string))
  );

  if (pendingNode) {
    const savedCtx = { ...(conv?.context as Record<string, unknown>) };
    const isButtonReply = messageType === 'interactive' || messageType === 'button';

    // Always resume the flow on any reply (button click OR text).
    // Text replies work when buttons don't render on WhatsApp —
    // the customer's text is stored as button_value so conditions
    // can still evaluate it.
    delete savedCtx.pending_flow_node;
    delete savedCtx._pending_pause_type;
    await supabaseAdmin
      .from('conversations')
      .update({ context: { ...savedCtx, pending_flow_node: null, _pending_pause_type: null } })
      .eq('id', conversationId);

    // Find the flow that owns this node and resume, with restored variables
    const ownerFlow = (flows as FlowRecord[]).find(f => f.nodes.some(n => n.id === pendingNode));
    if (ownerFlow) {
      const resumeVars = { ...ctx.variables, ...savedCtx };
      // Save the customer's reply into the variable configured by ask_question/collect_input
      const pendingSaveAs = (savedCtx._pending_save_as as string || '').trim();
      if (pendingSaveAs) {
        resumeVars[pendingSaveAs] = messageText;
        delete resumeVars._pending_save_as;
      }
      // Capture the customer's reply — button click id OR typed text
      if (buttonId) {
        resumeVars.selected_button = buttonId;
        resumeVars.button_value = buttonId;
      } else {
        // Text reply (buttons didn't render or customer typed instead)
        // Store the text as button_value so condition nodes can evaluate it
        resumeVars.selected_button = messageText;
        resumeVars.button_value = messageText;
      }
      resumeVars.last_message = messageText;
      const resumeCtx: ExecContext = { ...ctx, variables: resumeVars, pendingFlowNode: pendingNode };
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
    // Session dedup for all_messages / catch-all flows: once they fire and send
    // a message in a conversation, don't fire again for 24h — the AI handles
    // follow-up questions. Without this, "all_messages" flows override EVERY
    // message with the same canned response (e.g. customer asks "which hotel?"
    // and gets the generic package info instead of a specific answer).
    const isEffectivelyAllMessages =
      flow.trigger_type === 'all_messages' ||
      (flow.trigger_type !== 'first_message' &&
       flow.trigger_type !== 'new_lead' &&
       (!flow.trigger_keywords || flow.trigger_keywords.length === 0));
    if (isEffectivelyAllMessages) {
      const firedKey = `all_msg_flow_fired_${flow.id}`;
      const firedAt = convCtx[firedKey] as string | undefined;
      if (firedAt) {
        const age = Date.now() - new Date(firedAt).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          console.log(`🛡️ Flow engine: skipping all_messages flow "${flow.name}" — already fired ${Math.round(age / 60000)}min ago`);
          continue;
        }
      }
    }

    if (triggerMatches(flow, lowerMsg, isFirstMessage, messageType, buttonId, hasActiveWorkflow, isFromAd, referral?.source_id)) {
      const handled = await executeFlow(flow, ctx);
      if (handled) {
        // Mark all_messages flows as fired so they don't repeat in this session
        if (isEffectivelyAllMessages) {
          const firedKey = `all_msg_flow_fired_${flow.id}`;
          await supabaseAdmin
            .from('conversations')
            .update({ context: { ...convCtx, [firedKey]: new Date().toISOString() } })
            .eq('id', conversationId);
        }
        return true;
      }
    }
  }

  return false;
}

// ── Trigger matching ─────────────────────────────────────────
function triggerMatches(
  flow: FlowRecord,
  lowerMsg: string,
  isFirstMessage: boolean,
  messageType = 'text',
  buttonId?: string,
  hasActiveWorkflow = false,
  isFromAd = false,
  adSourceId?: string
): boolean {
  // CTWA trigger — fires only when the message came from a Meta WhatsApp Ad click.
  // If the ctwa_trigger node has an ad_id configured, only fire for that specific ad.
  const hasCtwa = flow.nodes?.some(n => n.type === 'ctwa_trigger');
  if (hasCtwa) {
    if (!isFromAd) return false;
    const ctwaNode = flow.nodes.find(n => n.type === 'ctwa_trigger');
    const filteredAdId = (ctwaNode?.data?.ad_id as string || '').trim();
    if (filteredAdId) return adSourceId === filteredAdId;
    return true;
  }

  // Check if this flow has a button_trigger node — if so, only fire on button clicks
  const hasButtonTriggerNode = flow.nodes?.some(n => n.type === 'button_trigger');
  if (hasButtonTriggerNode) {
    const isButtonMsg = messageType === 'interactive' || messageType === 'button';
    if (!isButtonMsg) return false;
    // Find the button_trigger node to get the expected button value
    const btnNode = flow.nodes.find(n => n.type === 'button_trigger');
    const mode = (btnNode?.data?.mode as string) || 'any';
    if (mode === 'any') return true;
    const expected = (btnNode?.data?.button as string || '').toLowerCase().trim();
    if (!expected) return true;
    // Match against buttonId or message text
    const bid = (buttonId || '').toLowerCase();
    const msg = lowerMsg;
    return bid === expected || msg.includes(expected);
  }

  // Webhook trigger — fires only when called from the external webhook route
  const hasWebhookTriggerNode = flow.nodes?.some(n => n.type === 'webhook_trigger');
  if (hasWebhookTriggerNode) {
    return messageType === 'webhook';
  }

  // Inactivity trigger — fires only from the cron job
  const hasInactivityTriggerNode = flow.nodes?.some(n => n.type === 'inactivity_trigger');
  if (hasInactivityTriggerNode) {
    return messageType === 'inactivity';
  }

  // Scheduled trigger — fires only from the scheduled cron
  const hasScheduleTriggerNode = flow.nodes?.some(n => n.type === 'schedule_trigger');
  if (hasScheduleTriggerNode) {
    return messageType === 'scheduled';
  }

  switch (flow.trigger_type) {
    case 'all_messages':
      // Block all_messages flows when an AI booking or flow sequence is already in progress.
      // Firing into mid-booking conversations injects unexpected messages that confuse the customer.
      if (hasActiveWorkflow) {
        console.log(`🛡️ Flow engine: skipping all_messages flow "${flow.name}" — active workflow in progress`);
        return false;
      }
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
  const MAX_STEPS = 100; // raised from 20 — enterprise flows can have 50+ nodes
  let steps = 0;

  while (currentId && steps < MAX_STEPS) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    steps++;

    if (steps === 50) {
      console.warn(`⚠️ Flow engine: 50 steps reached — check for unintended loops (flow will stop at ${MAX_STEPS})`);
    }

    const node = nodes.find(n => n.id === currentId);
    if (!node) break;

    const result = await executeNode(node, ctx, edges, nodes);
    if (result.sent) messageSent = true;
    if (result.stop) break;
    currentId = result.nextId ?? null;
  }

  return messageSent;
}

async function executeFlowFromNode(flow: FlowRecord, ctx: ExecContext, startNodeId: string): Promise<boolean> {
  return executeFlowGraph(flow.nodes as FlowNode[], flow.edges as FlowEdge[], ctx, startNodeId);
}

async function executeFlow(flow: FlowRecord, ctx: ExecContext): Promise<boolean> {
  const nodes = flow.nodes as FlowNode[];
  const edges = flow.edges as FlowEdge[];

  const triggerNode = nodes.find(
    n => n.type === 'trigger'
      || n.type === 'keyword_trigger'
      || n.type === 'button_trigger'
      || n.type === 'ctwa_trigger'
      || n.type === 'webhook_trigger'
      || n.type === 'inactivity_trigger'
      || n.type === 'schedule_trigger'
  );
  if (!triggerNode) return false;

  // For button_trigger nodes, store the button value in variables for downstream use
  if (triggerNode.type === 'button_trigger' && ctx.buttonId) {
    ctx.variables.selected_button = ctx.buttonId;
    ctx.variables.button_value    = ctx.buttonId;
  }

  // For ctwa_trigger nodes, ad variables are already in ctx.variables (set during ctx init)
  // but also set a convenience flag for condition nodes
  if (triggerNode.type === 'ctwa_trigger') {
    ctx.variables.is_from_ad = true;
  }

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
  if (type === 'trigger' || type === 'keyword_trigger' || type === 'ctwa_trigger') {
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'trigger_matched', payload: String(node.data?.label || 'Flow started'), nextId: getNextNode(node.id, null, edges) });
    }
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

  // ── Send Gallery (multiple photos/videos in order) ────────
  if (type === 'send_gallery') {
    type GalleryItem = { url: string; type: string; caption: string };
    const items: GalleryItem[] = Array.isArray(node.data?.items) ? (node.data.items as GalleryItem[]) : [];
    const delayMs = Math.min(Math.max(Number(node.data?.delayMs) || 1000, 200), 5000);

    if (items.length === 0) {
      return { nextId: getNextNode(node.id, null, edges) };
    }

    if (ctx.dryRun) {
      ctx.trace?.push({
        nodeId: node.id, nodeType: type, action: 'send_gallery',
        payload: `${items.length} media items`,
        variables: { ...ctx.variables },
        nextId: getNextNode(node.id, null, edges),
      });
      return { nextId: getNextNode(node.id, null, edges), sent: true };
    }

    let sentCount = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const mediaUrl = interpolate(item.url || '', ctx);
      const caption  = interpolate(item.caption || '', ctx);
      if (!mediaUrl.trim()) continue;

      const metaType = item.type === 'document' ? 'document'
        : item.type === 'video' ? 'video'
        : 'image' as MetaMediaType;

      try {
        await sendMediaMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, metaType, mediaUrl, caption || undefined);
        await supabaseAdmin.from('messages').insert({
          tenant_id: ctx.tenantId,
          conversation_id: ctx.conversationId,
          direction: 'outbound',
          content: caption || `[${item.type}]`,
          message_type: item.type || 'image',
          channel: 'whatsapp',
          status: 'sent',
          ai_generated: false,
          media_url: mediaUrl,
          media_caption: caption || null,
        });
        sentCount++;
      } catch (e) {
        console.error(`Flow engine: gallery item ${i + 1}/${items.length} failed:`, (e as Error).message);
      }

      if (i < items.length - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return { nextId: getNextNode(node.id, null, edges), sent: sentCount > 0 };
  }

  // ── Send Interactive Buttons ──────────────────────────────
  if (type === 'send_buttons' || type === 'send_quick_replies') {
    const raw = (node.data?.message as string) || (node.data?.content as string) || '';
    const content = interpolate(raw, ctx);
    const buttons: Array<{ id?: string; label?: string; value?: string; title?: string }> =
      Array.isArray(node.data?.buttons) ? (node.data.buttons as any[]) : [];
    const headerText = node.data?.header ? interpolate(node.data.header as string, ctx) : undefined;
    const footerText = node.data?.footer ? interpolate(node.data.footer as string, ctx) : undefined;

    if (!content.trim()) return { nextId: getNextNode(node.id, null, edges) };

    const mappedButtons = buttons
      .filter(b => (b.label || b.title || '').trim())
      .slice(0, 3)
      .map(b => ({
        id: (b.value || b.id || b.label || '').trim(),
        title: (b.label || b.title || '').trim().slice(0, 20),
      }));

    if (ctx.dryRun) {
      // Simulate auto-pause: show that the flow waits here for a button click.
      // Pick the first button as the simulated reply so downstream conditions work.
      const simButton = mappedButtons[0];
      if (simButton) {
        ctx.variables.selected_button = simButton.id;
        ctx.variables.button_value = simButton.id;
      }
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'send_interactive_buttons', payload: { body: content, buttons: mappedButtons, pause: true, simulatedReply: simButton?.id }, variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges), sent: true };
    }

    try {
      console.log(`🔘 Flow send_buttons node: ${mappedButtons.length} buttons, raw=${JSON.stringify(buttons.slice(0, 3))}`);
      if (mappedButtons.length > 0) {
        await sendInteractiveButtonsMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, content, mappedButtons, headerText, footerText);
      } else {
        console.warn(`⚠️ Flow send_buttons: no valid buttons — falling back to text`);
        await sendTextMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, content);
      }
      await supabaseAdmin.from('messages').insert({
        tenant_id: ctx.tenantId,
        conversation_id: ctx.conversationId,
        direction: 'outbound',
        content,
        message_type: mappedButtons.length > 0 ? 'interactive' : 'text',
        channel: 'whatsapp',
        status: 'sent',
        ai_generated: false,
      });

      // Auto-pause after sending so the flow waits for the customer's
      // reply before continuing. Without this, sequential questions all
      // fire in one shot. Applies even when buttons are empty (degraded
      // to text) because the node type semantically means "ask and wait."
      const nextNodeId = getNextNode(node.id, null, edges);
      if (nextNodeId) {
        await supabaseAdmin
          .from('conversations')
          .update({ context: { ...ctx.variables, pending_flow_node: nextNodeId, _pending_pause_type: 'buttons' } })
          .eq('id', ctx.conversationId);
      }
      return { stop: true, sent: true };
    } catch (e) {
      console.error(`Flow engine: sendInteractiveButtons failed for node ${node.id}:`, (e as Error).message);
      return { nextId: getNextNode(node.id, 'error', edges) };
    }
  }

  // ── Send Interactive List ───────────────────────────────────
  if (type === 'send_list') {
    const raw = (node.data?.message as string) || (node.data?.content as string) || '';
    const content = interpolate(raw, ctx);
    const items: Array<{ id?: string; title?: string; label?: string; description?: string; value?: string }> =
      Array.isArray(node.data?.items) ? (node.data.items as any[]) :
      Array.isArray(node.data?.options) ? (node.data.options as any[]) :
      Array.isArray(node.data?.buttons) ? (node.data.buttons as any[]) : [];
    const buttonLabel = (node.data?.buttonLabel as string) || (node.data?.button_label as string) || 'Select';
    const headerText = node.data?.header ? interpolate(node.data.header as string, ctx) : undefined;
    const footerText = node.data?.footer ? interpolate(node.data.footer as string, ctx) : undefined;

    if (!content.trim()) return { nextId: getNextNode(node.id, null, edges) };

    const rows = items
      .filter(i => (i.title || i.label || '').trim())
      .slice(0, 10)
      .map(i => ({
        id: (i.value || i.id || i.title || i.label || '').trim(),
        title: (i.title || i.label || '').trim().slice(0, 24),
        ...(i.description ? { description: i.description.slice(0, 72) } : {}),
      }));

    if (ctx.dryRun) {
      const simRow = rows[0];
      if (simRow) {
        ctx.variables.selected_button = simRow.id;
        ctx.variables.button_value = simRow.id;
      }
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'send_interactive_list', payload: { body: content, rows, pause: true, simulatedReply: simRow?.id }, variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges), sent: true };
    }

    try {
      if (rows.length > 0) {
        await sendInteractiveListMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, content, buttonLabel, [{ rows }], headerText, footerText);
      } else {
        await sendTextMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, content);
      }
      await supabaseAdmin.from('messages').insert({
        tenant_id: ctx.tenantId,
        conversation_id: ctx.conversationId,
        direction: 'outbound',
        content,
        message_type: rows.length > 0 ? 'interactive' : 'text',
        channel: 'whatsapp',
        status: 'sent',
        ai_generated: false,
      });

      const nextNodeId = getNextNode(node.id, null, edges);
      if (nextNodeId) {
        await supabaseAdmin
          .from('conversations')
          .update({ context: { ...ctx.variables, pending_flow_node: nextNodeId, _pending_pause_type: 'list' } })
          .eq('id', ctx.conversationId);
      }
      return { stop: true, sent: true };
    } catch (e) {
      console.error(`Flow engine: sendInteractiveList failed for node ${node.id}:`, (e as Error).message);
      return { nextId: getNextNode(node.id, 'error', edges) };
    }
  }

  // ── Send Text Message ─────────────────────────────────────
  if (
    type === 'standard' ||
    type === 'send_location' ||
    type === 'collect_input' ||
    type === 'ask_question'
  ) {
    const raw = (node.data?.content as string) || (node.data?.message as string) || '';
    const content = interpolate(raw, ctx);
    const isQuestion = type === 'ask_question' || type === 'collect_input';
    if (content.trim()) {
      if (ctx.dryRun) {
        ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'send_message', payload: content, variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
        if (isQuestion) return { stop: true, sent: true };
        return { nextId: getNextNode(node.id, null, edges), sent: true };
      }
      try {
        await sendTextMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, content);
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

        // ask_question / collect_input: pause flow and wait for customer reply
        // before continuing — without this, sequential questions all fire at once
        if (isQuestion) {
          const nextNodeId = getNextNode(node.id, null, edges);
          if (nextNodeId) {
            const saveAs = (node.data?.saveAs as string || '').trim();
            await supabaseAdmin
              .from('conversations')
              .update({
                context: {
                  ...ctx.variables,
                  pending_flow_node: nextNodeId,
                  _pending_pause_type: 'question',
                  ...(saveAs ? { _pending_save_as: saveAs } : {}),
                },
              })
              .eq('id', ctx.conversationId);
          }
          return { stop: true, sent: true };
        }

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
    if (ctx.dryRun) {
      const desc = field ? `${field} ${operator} "${targetVal}" → ${matched ? 'TRUE ✓' : 'FALSE ✗'}` : `keyword match: ${matched}`;
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: matched ? 'condition_true' : 'condition_false', payload: desc, variables: { ...ctx.variables }, nextId: getNextNode(node.id, matched ? 'true' : 'false', edges) });
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
    const seconds = Math.min(Number(node.data?.seconds ?? node.data?.delay ?? node.data?.duration ?? 1), 5);
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'delay', payload: `${seconds}s`, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
    await new Promise(r => setTimeout(r, seconds * 1000));
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Webhook — real HTTP call, stores JSON response in variables ──────────
  if (type === 'webhook') {
    const method = ((node.data?.method as string) || 'POST').toUpperCase();
    const rawUrl  = (node.data?.url as string) || '';
    const url     = interpolate(rawUrl, ctx);

    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'webhook_call', payload: { method, url }, variables: { ...ctx.variables }, nextId: getNextNode(node.id, 'success', edges) });
      return { nextId: getNextNode(node.id, 'success', edges) };
    }
    if (!url || !url.startsWith('http')) {
      console.error(`Flow engine: webhook node ${node.id} has invalid url: "${url}"`);
      return { nextId: getNextNode(node.id, 'error', edges) };
    }

    // ── Build headers from node.data.headers (key-value array) ──────────────
    const headersObj: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Aries-Tenant': ctx.tenantId,
    };
    const customHeaders = Array.isArray(node.data?.headers) ? (node.data.headers as Array<{ key: string; value: string }>) : [];
    for (const h of customHeaders) {
      if (h.key?.trim()) headersObj[h.key.trim()] = interpolate(h.value || '', ctx);
    }

    // ── Build query params ───────────────────────────────────────────────────
    const qp = new URLSearchParams();
    const customParams = Array.isArray(node.data?.queryParams) ? (node.data.queryParams as Array<{ key: string; value: string }>) : [];
    for (const p of customParams) {
      if (p.key?.trim()) qp.set(p.key.trim(), interpolate(p.value || '', ctx));
    }
    const finalUrl = qp.toString() ? `${url}?${qp}` : url;

    // ── Build request body ───────────────────────────────────────────────────
    const bodyMode  = (node.data?.bodyMode as string) || 'json';
    const rawBody   = (node.data?.body as string) || '';
    let bodyStr: string | undefined;
    if (method !== 'GET' && bodyMode !== 'none') {
      if (rawBody.trim()) {
        // Interpolate {{variables}} inside the JSON body string
        bodyStr = interpolate(rawBody, ctx);
      } else {
        // Refinement 2: zero-config fallback — still works out of the box
        bodyStr = JSON.stringify({
          phone:    ctx.phone,
          ...ctx.variables,
        });
      }
    }

    // ── Timeout & retry config ───────────────────────────────────────────────
    const timeoutMs   = Math.min(Number(node.data?.timeout   ?? 10_000), 30_000);
    const retryCount  = Math.min(Number(node.data?.retryCount  ?? 1),  3);
    const retryStrat  = (node.data?.retryStrategy as string) || 'exponential';
    const errorBehav  = (node.data?.errorBehavior as string) || 'error_branch';

    // ── Dot-path getter for response mapping (Refinement 5) ─────────────────
    const dotGet = (obj: unknown, path: string): unknown => {
      if (!path) return obj;
      return path.split('.').reduce<unknown>((acc, key) => {
        if (acc == null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
      }, obj);
    };

    // ── Execute with retry ───────────────────────────────────────────────────
    const attempt = async (): Promise<Response> => {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const init: RequestInit = {
        method,
        headers: headersObj,
        signal: controller.signal,
        ...(bodyStr !== undefined ? { body: bodyStr } : {}),
      };
      try {
        const res = await fetch(finalUrl, init);
        clearTimeout(tid);
        return res;
      } catch (e) {
        clearTimeout(tid);
        throw e;
      }
    };

    try {
      let res: Response | null = null;
      let lastErr: unknown = null;

      for (let attempt_n = 0; attempt_n <= retryCount; attempt_n++) {
        if (attempt_n > 0) {
          const delay = retryStrat === 'exponential'
            ? Math.min(500 * Math.pow(2, attempt_n - 1), 8_000)
            : 1_000;
          await new Promise(r => setTimeout(r, delay));
        }
        try {
          res = await attempt();
          if (res.ok) break; // success — stop retrying
          // HTTP error: retry
        } catch (e) {
          lastErr = e;
          if (attempt_n === retryCount) throw e;
        }
      }

      if (!res) throw lastErr ?? new Error('Webhook failed after retries');

      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        const data: unknown = ct.includes('application/json') ? await res.json() : await res.text();
        ctx.variables[`${node.id}_response`] = data;
        ctx.variables.webhook_response = data;

        // Auto-flatten top-level keys (backwards compat)
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          Object.assign(ctx.variables, data as Record<string, unknown>);
        }

        // Apply explicit response mappings (dot-path, Refinement 5)
        const mappings = Array.isArray(node.data?.responseMappings)
          ? (node.data.responseMappings as Array<{ from: string; to: string }>)
          : [];
        for (const m of mappings) {
          if (m.to?.trim()) {
            const val = dotGet(data, (m.from || '').replace(/^response\./, ''));
            if (val !== undefined) ctx.variables[m.to.trim()] = val;
          }
        }

        return { nextId: getNextNode(node.id, 'success', edges) };
      }

      // HTTP error response — read body so structured errors (e.g. slot_full) are accessible
      let errBody: Record<string, unknown> | null = null;
      try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) errBody = await res.json();
      } catch { /* ignore parse failure */ }

      ctx.variables[`${node.id}_error`] = res.status;
      if (errBody) {
        Object.assign(ctx.variables, errBody);
        ctx.variables[`${node.id}_error_body`] = errBody;
      }

      // slot_full (409) — auto-notify the customer so flows without an error branch still work
      if (res.status === 409 && errBody?.error === 'slot_full') {
        const customerMsg = typeof errBody.message === 'string'
          ? errBody.message
          : 'Sorry, that time slot is fully booked. Please choose a different time.';
        if (ctx.accessToken && ctx.phoneNumberId && ctx.phone) {
          await sendTextMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, customerMsg).catch(() => {});
        }
        console.warn(`⚠️ Flow engine: slot_full for ${ctx.phone} — sent alternative-slots message`);
      }

      if (errorBehav === 'continue') return { nextId: getNextNode(node.id, 'success', edges) };
      return { nextId: getNextNode(node.id, 'error', edges) };

    } catch (e) {
      console.error(`Flow engine: webhook ${node.id} failed:`, (e as Error).message);
      ctx.variables[`${node.id}_error`] = (e as Error).message;
      if (errorBehav === 'continue') return { nextId: getNextNode(node.id, 'success', edges) };
      return { nextId: getNextNode(node.id, 'error', edges) };
    }
  }

  // ── Interruption — AI intent extraction into variables ───
  if (type === 'interruption') {
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'ai_intent', payload: `Analyzing: "${ctx.messageText.slice(0, 60)}"`, variables: { ...ctx.variables }, nextId: getNextNode(node.id, 'success', edges) });
      return { nextId: getNextNode(node.id, 'success', edges) };
    }
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
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'knowledge_search', payload: `Searching docs: "${ctx.messageText.slice(0, 40)}"`, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
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
    if (ctx.dryRun) {
      const keys = Object.keys(ctx.variables).filter(Boolean).join(', ');
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'memory_saved', payload: keys || 'no variables yet', variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
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
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'format_message', payload: String(ctx.variables.formatted_message || '(no input to format)'), variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
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
    if (ctx.dryRun) {
      const found = [emailMatch && `email: ${emailMatch[0]}`, phoneMatch && `phone: ${phoneMatch[0]}`, nameMatch && `name: ${nameMatch[1].trim()}`].filter(Boolean).join(', ');
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'extract_entities', payload: found || 'no entities found in message', variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Book Appointment — creates Google Calendar event ─────
  if (type === 'book_appointment') {
    if (ctx.dryRun) {
      const title = interpolate((node.data?.title as string) || 'Appointment', ctx);
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'book_appointment', payload: `Would book: "${title}"`, variables: { ...ctx.variables }, nextId: getNextNode(node.id, 'success', edges) });
      return { nextId: getNextNode(node.id, 'success', edges) };
    }
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
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'send_message', payload: '[AI would generate a response based on conversation context]', nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges), sent: true };
    }
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
        .update({ context: { ...ctx.variables, pending_flow_node: nextNodeId, _pending_pause_type: 'wait_for_reply' } })
        .eq('id', ctx.conversationId);
    }
    return { stop: true }; // Stop execution until next inbound message resumes here
  }

  // ── End ──────────────────────────────────────────────────
  if (type === 'end' || node.id === 'end') {
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'end_flow', payload: 'Flow completed', nextId: null });
    }
    return { stop: true };
  }

  // ── Resume (return to listening mode) ────────────────────
  if (type === 'resume') {
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'resume_flow', payload: 'Returned to listening mode', nextId: null });
    }
    return { stop: true };
  }

  // ── Intake Form — Multi-field sequential interactive capture ─────────────
  if (type === 'intake_form') {
    const fields = Array.isArray(node.data?.fields) ? (node.data.fields as any[]) : [];
    if (fields.length === 0) {
      return { nextId: getNextNode(node.id, null, edges) };
    }

    const mappedFields = fields.map(f => {
      const saveAs = String(f.saveAs ?? '').trim();
      const fieldName = String(f.name ?? '').toLowerCase().replace(/\s+/g, '_');
      return {
        ...f,
        varName: saveAs || fieldName,
      };
    });

    const isResume = (ctx.pendingFlowNode === node.id);

    // If resuming, save incoming reply to the first missing field
    if (isResume) {
      const activeField = mappedFields.find(f => ctx.variables[f.varName] == null || String(ctx.variables[f.varName]).trim() === '');
      if (activeField) {
        ctx.variables[activeField.varName] = ctx.messageText;
        if (!ctx.dryRun) {
          try {
            await supabaseAdmin
              .from('conversations')
              .update({ context: ctx.variables })
              .eq('id', ctx.conversationId);
          } catch (e) {
            console.error('Failed to save intake answer to DB context:', e);
          }
        }
      }
    }

    // Find the next incomplete field
    const nextField = mappedFields.find(f => ctx.variables[f.varName] == null || String(ctx.variables[f.varName]).trim() === '');

    if (nextField) {
      const prompt = nextField.placeholder || `Please enter your ${nextField.name}:`;
      
      if (ctx.dryRun) {
        ctx.trace?.push({
          nodeId: node.id,
          nodeType: type,
          action: 'send_message',
          payload: prompt,
          variables: { ...ctx.variables },
          nextId: node.id,
        });
        return { stop: true };
      }

      try {
        await sendTextMessage(ctx.accessToken, ctx.phoneNumberId, ctx.phone, prompt);
        await supabaseAdmin.from('messages').insert({
          tenant_id: ctx.tenantId,
          conversation_id: ctx.conversationId,
          direction: 'outbound',
          content: prompt,
          message_type: 'text',
          channel: 'whatsapp',
          status: 'sent',
          ai_generated: false,
        });
        // Save pending flow node to conversation context
        await supabaseAdmin
          .from('conversations')
          .update({ context: { ...ctx.variables, pending_flow_node: node.id, _pending_pause_type: 'question' } })
          .eq('id', ctx.conversationId);

        return { stop: true, sent: true };
      } catch (e) {
        console.error(`Flow engine: intake prompt send failed for node ${node.id}:`, (e as Error).message);
        return { nextId: getNextNode(node.id, null, edges) };
      }
    }

    // All fields populated — transition to next node
    if (ctx.dryRun) {
      ctx.trace?.push({
        nodeId: node.id,
        nodeType: type,
        action: 'collect_data',
        payload: 'Form completed successfully',
        variables: { ...ctx.variables },
        nextId: getNextNode(node.id, null, edges),
      });
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Collect Data / Resume Parser — multi-field capture ───
  if (type === 'collect_data' || type === 'resume_parser') {
    const fields = Array.isArray(node.data?.fields)
      ? (node.data.fields as any[]).map(f => typeof f === 'string' ? f : String(f.name || '')).slice(0, 4).join(', ')
      : String(node.data?.extracts || '');
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'collect_data', payload: fields || 'collecting user input', nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Send Email — via Resend ──────────────────────────────
  if (type === 'send_email') {
    const to      = interpolate((node.data?.to      as string) || (ctx.variables.email as string) || '', ctx);
    const subject = interpolate((node.data?.subject as string) || 'Message from AriesAI', ctx);
    const body    = interpolate((node.data?.body    as string) || '', ctx);

    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'send_email', payload: { to, subject }, variables: { ...ctx.variables }, nextId: getNextNode(node.id, 'success', edges) });
      return { nextId: getNextNode(node.id, 'success', edges) };
    }

    if (!to || !to.includes('@')) {
      console.warn(`Flow engine: send_email node ${node.id} — no valid email address (got "${to}")`);
      return { nextId: getNextNode(node.id, 'error', edges) };
    }

    // Get sender name from tenant
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants').select('business_name').eq('id', ctx.tenantId).single();
    const fromName = (tenantRow?.business_name as string) || 'AriesAI';

    const ok = await sendFlowEmail(to, subject, body || subject, fromName);
    return { nextId: getNextNode(node.id, ok ? 'success' : 'error', edges) };
  }

  // ── Set Variable — assign one or more variables ──────────
  if (type === 'set_variable') {
    const assignments = Array.isArray(node.data?.assignments)
      ? (node.data.assignments as Array<{ key: string; value: string }>)
      : [{ key: node.data?.varName as string, value: node.data?.varValue as string }];

    for (const a of assignments) {
      const key = (a.key || '').trim();
      if (key) ctx.variables[key] = interpolate(a.value || '', ctx);
    }

    if (ctx.dryRun) {
      const summary = assignments.map(a => `${a.key}="${interpolate(a.value || '', ctx)}"`).join(', ');
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'set_variable', payload: summary, variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Update Tag — update lead tag / status ────────────────
  if (type === 'update_tag') {
    const tag = interpolate((node.data?.tag as string) || '', ctx);
    if (ctx.dryRun) {
      ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'update_tag', payload: tag || '(no tag)', variables: { ...ctx.variables }, nextId: getNextNode(node.id, null, edges) });
      return { nextId: getNextNode(node.id, null, edges) };
    }
    if (tag && ctx.leadId) {
      try {
        await supabaseAdmin.from('leads').update({ lead_status: tag.toLowerCase() }).eq('id', ctx.leadId);
      } catch (e) {
        console.error('Flow engine: update_tag failed:', e);
      }
    }
    return { nextId: getNextNode(node.id, null, edges) };
  }

  // ── Intent Routing — route to branch matching intent ─────
  if (type === 'intent_routing') {
    const intents: Array<{ id: string; name: string; keywords: string[] }> =
      Array.isArray(node.data?.intents) ? (node.data.intents as any[]) : [];

    // Match the incoming message against each intent's keywords
    const lowerMsg = ctx.messageText.toLowerCase();
    const matched  = intents.find(intent =>
      (intent.keywords || []).some(kw => keywordMatches(lowerMsg, kw))
    );

    const branchHandle = matched ? matched.id : 'fallback';

    if (ctx.dryRun) {
      ctx.trace?.push({
        nodeId: node.id, nodeType: type,
        action: matched ? `intent_matched:${matched.name}` : 'intent_fallback',
        payload: matched ? `Matched intent "${matched.name}"` : 'No intent matched → fallback',
        variables: { ...ctx.variables },
        nextId: getNextNode(node.id, branchHandle, edges),
      });
    }

    if (matched) ctx.variables.matched_intent = matched.name;
    return { nextId: getNextNode(node.id, branchHandle, edges) };
  }

  // ── Unknown node type — just traverse ───────────────────
  if (ctx.dryRun) {
    ctx.trace?.push({ nodeId: node.id, nodeType: type, action: 'node_executed', payload: String(node.data?.label || type), nextId: getNextNode(node.id, null, edges) });
  }
  return { nextId: getNextNode(node.id, null, edges) };
}

// ── Inactivity Trigger — called from cron ────────────────────
/**
 * Finds conversations that have been silent for N+ hours and fires
 * any active flows whose canvas entry node is type 'inactivity_trigger'.
 * Returns the number of flows executed.
 */
export async function runInactivityFlows(): Promise<number> {
  let fired = 0;
  try {
    // Pull all active flows that contain an inactivity_trigger node
    const { data: flows } = await supabaseAdmin
      .from('automation_flows')
      .select('id, tenant_id, name, nodes, edges')
      .eq('is_active', true);

    if (!flows || flows.length === 0) return 0;

    for (const flow of flows as Array<FlowRecord & { tenant_id: string }>) {
      const inactNode = (flow.nodes as FlowNode[]).find(n => n.type === 'inactivity_trigger');
      if (!inactNode) continue;

      // How many hours of silence before triggering (default 24)
      const thresholdHours = Number(inactNode.data?.hours ?? inactNode.data?.timeoutHours ?? 24);
      const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString();

      // Find conversations for this tenant that haven't had a message since cutoff
      const { data: staleConvs } = await supabaseAdmin
        .from('conversations')
        .select('id, sender_id, lead_id, context')
        .eq('tenant_id', flow.tenant_id)
        .eq('is_active', true)
        .eq('bot_paused', false)
        .lt('last_message_at', cutoff);

      if (!staleConvs || staleConvs.length === 0) continue;

      // Load tenant credentials once per flow
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id, business_name')
        .eq('id', flow.tenant_id)
        .single();
      if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) continue;

      const accessToken = decryptToken(tenant.wa_access_token as string);
      if (!accessToken) continue;

      for (const conv of staleConvs) {
        // Don't fire the same inactivity flow twice for the same conversation
        const ctxData = (conv.context as Record<string, unknown>) || {};
        const lastFiredKey = `inactivity_flow_fired_${flow.id}`;
        if (ctxData[lastFiredKey]) continue;

        // Load lead name
        let leadName = '';
        if (conv.lead_id) {
          const { data: lead } = await supabaseAdmin
            .from('leads').select('name').eq('id', conv.lead_id).single();
          leadName = (lead as { name?: string } | null)?.name || '';
        }

        const ctx: ExecContext = {
          tenantId: flow.tenant_id,
          leadId: conv.lead_id || null,
          leadName,
          conversationId: conv.id,
          phone: conv.sender_id,
          accessToken,
          phoneNumberId: tenant.wa_phone_number_id as string,
          messageText: '',
          isFirstMessage: false,
          messageType: 'inactivity',
          variables: {
            wa_name: leadName || 'there',
            wa_phone: conv.sender_id,
            tenant_name: (tenant.business_name as string) || 'Business',
            current_date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            current_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
            ...ctxData,
          },
        };

        try {
          const sent = await executeFlowGraph(
            flow.nodes as FlowNode[], flow.edges as FlowEdge[], ctx, inactNode.id
          );
          if (sent) {
            // Mark this inactivity flow as fired so it doesn't repeat
            await supabaseAdmin
              .from('conversations')
              .update({ context: { ...ctxData, [lastFiredKey]: new Date().toISOString() } })
              .eq('id', conv.id);
            fired++;
          }
        } catch (e) {
          console.error(`Inactivity flow: error running flow ${flow.id} for conv ${conv.id}:`, e);
        }
      }
    }
  } catch (e) {
    console.error('runInactivityFlows error:', e);
  }
  return fired;
}

// ── Scheduled Trigger — called from cron ─────────────────────
/**
 * Fires flows whose canvas entry node is 'schedule_trigger' and whose
 * cron expression matches the current time window.
 * Returns the number of flows executed.
 */
// ── Scheduled-occurrence window matching ─────────────────────
// Returns the schedule's occurrence Date if it falls inside the half-open
// window (windowStart, windowEnd], else null. Pure function so any invocation
// cadence (10-min external cron, daily Vercel cron, manual curl) fires each
// occurrence exactly once — the old `hhmm === schedTime` exact-minute match
// only ever worked when the endpoint was invoked every single minute; on the
// daily 09:00 UTC cron, flows scheduled for any other time NEVER fired.
export function scheduledOccurrenceInWindow(
  schedTime: string,
  freq: string,
  schedDow: number,
  schedDom: number,
  windowStart: Date,
  windowEnd: Date,
): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(schedTime.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;

  // Scan each UTC day the window touches (window is capped at 60 min upstream,
  // so this is at most 2 iterations — handles windows crossing midnight).
  const day = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), windowStart.getUTCDate()));
  for (; day.getTime() <= windowEnd.getTime(); day.setUTCDate(day.getUTCDate() + 1)) {
    const occ = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm));
    if (occ.getTime() <= windowStart.getTime() || occ.getTime() > windowEnd.getTime()) continue;
    const freqMatch =
      freq === 'daily'   ? true :
      freq === 'weekly'  ? occ.getUTCDay() === schedDow :
      freq === 'monthly' ? occ.getUTCDate() === schedDom :
      false;
    if (freqMatch) return occ;
  }
  return null;
}

export async function runScheduledFlows(): Promise<number> {
  let fired = 0;
  try {
    const { data: flows } = await supabaseAdmin
      .from('automation_flows')
      .select('id, tenant_id, name, nodes, edges')
      .eq('is_active', true);

    if (!flows || flows.length === 0) return 0;

    const now   = new Date();
    const hhmm  = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
    const dow   = now.getUTCDay(); // 0=Sun … 6=Sat
    const dom   = now.getUTCDate();

    // Catch-up window since the previous check, persisted in Redis. Capped at
    // 60 min so a long outage doesn't dump days of stale scheduled sends on
    // customers when service resumes. When Redis is unavailable we fall back
    // to the legacy exact-minute match (windowStart=null) — that mode can
    // never double-fire, which matters because the NX dedup below also needs
    // Redis; we accept missed schedules over duplicate customer messages.
    const redis = getRedisClient();
    let windowStart: Date | null = null;
    if (redis) {
      windowStart = new Date(now.getTime() - 60 * 60 * 1000);
      try {
        const last = await redis.get('flows:sched:last_run');
        if (last) {
          const lastDate = new Date(last);
          if (!isNaN(lastDate.getTime()) && lastDate.getTime() > windowStart.getTime() && lastDate.getTime() <= now.getTime()) {
            windowStart = lastDate;
          }
        }
        await redis.set('flows:sched:last_run', now.toISOString());
      } catch { /* keep the capped 60-min default window */ }
    }

    for (const flow of flows as Array<FlowRecord & { tenant_id: string }>) {
      const schedNode = (flow.nodes as FlowNode[]).find(n => n.type === 'schedule_trigger');
      if (!schedNode) continue;

      // Schedule is configured as frequency: daily | weekly | monthly
      // and time: "HH:MM" (UTC)
      const freq      = (schedNode.data?.frequency as string || 'daily').toLowerCase();
      const schedTime = (schedNode.data?.time as string || '09:00');
      const schedDow  = Number(schedNode.data?.dayOfWeek ?? 1);   // 1=Mon for weekly
      const schedDom  = Number(schedNode.data?.dayOfMonth ?? 1);  // 1 for monthly

      let occurrence: Date | null = null;
      if (windowStart) {
        occurrence = scheduledOccurrenceInWindow(schedTime, freq, schedDow, schedDom, windowStart, now);
      } else {
        // Legacy exact-minute match (Redis unavailable)
        const timeMatch = hhmm === schedTime;
        const freqMatch =
          freq === 'daily' ? true :
          freq === 'weekly' ? dow === schedDow :
          freq === 'monthly' ? dom === schedDom :
          false;
        occurrence = timeMatch && freqMatch ? now : null;
      }
      if (!occurrence) continue;

      // Per-occurrence dedup: overlapping invocations (e.g. the daily Vercel
      // cron and the external 10-min cron landing in the same window) must not
      // send the same scheduled flow twice. SET NX is atomic across instances.
      if (redis) {
        try {
          const dedupKey = `flows:sched:fired:${flow.id}:${occurrence.toISOString().slice(0, 16)}`;
          const acquired = await redis.set(dedupKey, '1', 'EX', 90000, 'NX');
          if (!acquired) continue; // another invocation already fired this occurrence
        } catch { /* Redis hiccup mid-run — proceed; window math still bounds duplicates */ }
      }

      // Load tenant credentials
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id, business_name')
        .eq('id', flow.tenant_id)
        .single();
      if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) continue;

      const accessToken = decryptToken(tenant.wa_access_token as string);
      if (!accessToken) continue;

      // Get all active leads for this tenant to broadcast the scheduled message
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, phone, name')
        .eq('tenant_id', flow.tenant_id)
        .not('phone', 'is', null)
        .limit(500);

      if (!leads || leads.length === 0) continue;

      for (const lead of leads as Array<{ id: string; phone: string; name?: string }>) {
        // Find or use a placeholder conversation id
        const { data: conv } = await supabaseAdmin
          .from('conversations')
          .select('id')
          .eq('tenant_id', flow.tenant_id)
          .eq('sender_id', lead.phone)
          .eq('is_active', true)
          .maybeSingle();

        const conversationId = conv?.id || `sched-${flow.id}-${lead.id}`;

        const ctx: ExecContext = {
          tenantId:       flow.tenant_id,
          leadId:         lead.id,
          leadName:       lead.name || '',
          conversationId,
          phone:          lead.phone,
          accessToken,
          phoneNumberId:  tenant.wa_phone_number_id as string,
          messageText:    '',
          isFirstMessage: false,
          messageType:    'scheduled',
          variables: {
            wa_name:      lead.name || 'there',
            wa_phone:     lead.phone,
            tenant_name:  (tenant.business_name as string) || 'Business',
            current_date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            current_time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
          },
        };

        try {
          await executeFlowGraph(
            flow.nodes as FlowNode[], flow.edges as FlowEdge[], ctx, schedNode.id
          );
          fired++;
        } catch (e) {
          console.error(`Scheduled flow: error running flow ${flow.id} for lead ${lead.id}:`, e);
        }
      }
    }
  } catch (e) {
    console.error('runScheduledFlows error:', e);
  }
  return fired;
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

  const nodes = (flow as FlowRecord).nodes as FlowNode[];
  const edges = (flow as FlowRecord).edges as FlowEdge[];

  // Load tenant name for realistic simulation context
  const { data: tenantRow } = await supabaseAdmin
    .from('tenants').select('business_name').eq('id', tenantId).single();
  const simTenantName = (tenantRow?.business_name as string) || 'Your Business';

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
    variables:       {
      wa_name: 'Test User',
      wa_phone: '+910000000000',
      tenant_name: simTenantName,
      current_date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      current_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
      language: 'en',
      last_message: testMessage,
      conversation_id: 'sim-' + flowId,
    },
    dryRun:          true,
    trace,
  };

  // Pre-populate mock values for flow-registered variables in dry-run mode
  const flowVars = getFlowVariables(nodes as any);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const mockValues: Record<string, unknown> = {
    booking_id: `SIM-${tomorrow.replace(/-/g, '')}-0001`,
    guest_name: 'Test User',
    booking_datetime: `${tomorrow} 7:00 PM`,
    party_size: '4',
    special_request: 'Window seat please',
    reservation_id: `SIM-${tomorrow.replace(/-/g, '')}-0001`,
    host_name: 'Test User',
    event_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    guest_count: '25',
    budget: '₹1000',
    requirements: 'Decor and AV setup',
  };

  for (const v of flowVars) {
    if (mockValues[v.name] === undefined) {
      ctx.variables[v.name] = `[Mock: ${v.label || v.name}]`;
    }
  }

  // Direct overlay to ensure they all exist in ctx.variables
  Object.assign(ctx.variables, mockValues);

  const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'keyword_trigger' || n.type === 'button_trigger' || n.type === 'ctwa_trigger');
  if (!triggerNode) return { matched: false, flowName: flow.name as string, trace, variables: {}, messageSent: false };

  if (triggerNode.type === 'ctwa_trigger') {
    ctx.variables.name = ctx.variables.name || 'Test User';
    ctx.variables.ad_headline = ctx.variables.ad_headline || 'Simulated Ad';
  }

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
