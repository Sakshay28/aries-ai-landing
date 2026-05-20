// ═══════════════════════════════════════════════════════════
// 📥 Gupshup Webhook Handler
// ═══════════════════════════════════════════════════════════
// Gupshup POSTs incoming messages and delivery status events
// to this endpoint. Must return 200 in < 5 seconds.
// All heavy lifting (AI, DB writes, sending) is async.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isDuplicateMessage, getRedisClient } from '@/lib/redis/client';
import { createPaymentLink } from '@/lib/payments/razorpay-links';
import { retrieveRelevantDocs } from '@/lib/ai/rag';
import { appendLeadRow } from '@/lib/integrations/google-sheets';
import { parseGupshupWebhook, sendTextMessage } from '@/lib/gupshup/service';
import { processMessageWithAI } from '@/lib/ai/engine';
import { getTenantConfig } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { runFlowsForMessage } from '@/lib/flows/engine';
import { fireIntegrations } from '@/lib/integrations/runner';

// ── Return 200 immediately — Gupshup requires < 5s response ──
export async function POST(req: NextRequest) {
  // ── P2-2: Shared-secret verification ─────────────────────────────
  // Set GUPSHUP_WEBHOOK_SECRET in Vercel env. Append ?token=<secret> to the
  // webhook URL you register in the Gupshup dashboard. If the env var is not
  // set we skip the check (safe for dev/testing).
  const webhookSecret = process.env.GUPSHUP_WEBHOOK_SECRET;
  if (webhookSecret) {
    const token =
      req.nextUrl.searchParams.get('token') ??
      req.headers.get('x-gupshup-token');
    if (token !== webhookSecret) {
      console.warn(`⚠️ Gupshup Webhook: Secret token mismatch. Provided: "${token}", Expected: "${webhookSecret}"`);
      // Return 200 so Gupshup doesn't retry; we just discard the forged payload.
      return NextResponse.json({ ok: true });
    }
  }

  let body: Record<string, unknown>;

  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      // Gupshup v2 sends form-encoded data
      const text = await req.text();
      console.log('📩 Gupshup raw form body:', text.slice(0, 1000));
      const params = new URLSearchParams(text);
      const rawPayload: Record<string, unknown> = {};
      params.forEach((value, key) => {
        // Try to parse JSON values (Gupshup nests JSON strings in form fields)
        try { rawPayload[key] = JSON.parse(value); } catch { rawPayload[key] = value; }
      });
      body = rawPayload;
    } else {
      // Try JSON as fallback, then form
      const text = await req.text();
      console.log('📩 Gupshup raw body (unknown content-type):', contentType, text.slice(0, 1000));
      try {
        body = JSON.parse(text);
      } catch {
        const params = new URLSearchParams(text);
        const rawPayload: Record<string, unknown> = {};
        params.forEach((value, key) => {
          try { rawPayload[key] = JSON.parse(value); } catch { rawPayload[key] = value; }
        });
        body = rawPayload;
      }
    }
  } catch (err) {
    console.error('❌ Gupshup: failed to parse request body:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to Gupshup
  }

  // Log full payload to diagnose parsing issues
  console.log('📩 Gupshup raw payload:', JSON.stringify(body).slice(0, 1000));

  // Validate required structure
  if (!body.type || !body.payload) {
    console.log('⚠️ Gupshup: missing type or payload, body keys:', Object.keys(body));
    return NextResponse.json({ ok: true }); // Accept silently — could be a Gupshup ping
  }

  // Parse webhook payload
  const parsed = parseGupshupWebhook(body);
  console.log('🔍 Gupshup parsed result:', JSON.stringify(parsed).slice(0, 500));
  if (!parsed) {
    return NextResponse.json({ ok: true });
  }

  // ── P2-1: True fire-and-forget via after() ───────────────────────
  // after() runs the callback AFTER the response is flushed to Gupshup.
  // This guarantees < 5s response time regardless of AI/DB latency.
  after(async () => {
    try {
      await processWebhookAsync(parsed);
    } catch (err) {
      console.error('❌ Gupshup webhook processing error:', err);
    }
  });

  return NextResponse.json({ ok: true });
}

// ── Validate that Gupshup can reach this endpoint ──
export async function GET() {
  return NextResponse.json({ status: 'Gupshup webhook endpoint active', provider: 'gupshup' });
}

// ═══════════════════════════════════════
// ASYNC: Full message processing pipeline
// ═══════════════════════════════════════
async function processWebhookAsync(parsed: Awaited<ReturnType<typeof parseGupshupWebhook>>) {
  if (!parsed) return;

  // Route by event type
  if (parsed.isStatusUpdate) {
    await handleStatusUpdate(parsed);
    return;
  }

  // Reactions are WhatsApp metadata — skip AI, skip DB insert
  if (parsed.isReaction) {
    console.log(`👍 Gupshup: reaction ignored (emoji: ${parsed.reactionEmoji}, to: ${parsed.reactedToMessageId})`);
    return;
  }

  await handleIncomingMessage(parsed);
}

// ═══════════════════════════════════════
// HANDLER: Incoming Message
// ═══════════════════════════════════════
async function handleIncomingMessage(
  msg: NonNullable<ReturnType<typeof parseGupshupWebhook>>
) {
  if (!msg.messageId || !msg.fromPhone || !msg.text) {
    console.log('⚠️ Gupshup: skipping message with missing fields');
    return;
  }

  // ── Deduplication: check if this message was already processed ──
  const isDup = await isDuplicateMessage(msg.messageId);
  if (isDup) {
    console.log(`⚡ Gupshup: duplicate message skipped: ${msg.messageId}`);
    return;
  }

  // ── Resolve tenant by Gupshup app name (v2 format doesn't include destination phone) ──
  console.log(`🔍 Looking up tenant for app: ${msg.appName} | phone fallback: ${msg.appPhone}`);

  // Try by app name first, then by phone number as fallback
  let tenant: Record<string, unknown> | null = null;

  const { data: tenantByApp } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('gupshup_app_name', msg.appName)
    .eq('is_active', true)
    .single();

  if (tenantByApp) {
    tenant = tenantByApp;
  } else {
    // Fallback: try by phone number
    const { data: tenantByPhone } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('gupshup_phone_number', msg.appPhone)
      .eq('is_active', true)
      .single();
    tenant = tenantByPhone;
  }

  if (!tenant) {
    console.error(`❌ Gupshup: no tenant found for app "${msg.appName}" or phone "${msg.appPhone}"`);
    return;
  }

  console.log(`✅ Gupshup: tenant found: ${tenant.id}`);


  // ── Resolve or create Lead (contact) ──
  const cleanPhone = msg.fromPhone.replace(/\D/g, '');
  let lead: Record<string, unknown> | null = null;

  const { data: existingLead } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('phone', cleanPhone)
    .single();

  // Detect Click-to-WhatsApp ad source
  const isFromAd = !!msg.referral && msg.referral.source_type === 'ad';
  const leadSource = isFromAd ? 'meta_ctwa' : 'whatsapp';

  if (existingLead) {
    lead = existingLead;
    // Update last_message_at; if first ad message, tag source
    const updateData: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    if (isFromAd && !existingLead.source) {
      updateData.source = leadSource;
    }
    await supabaseAdmin
      .from('leads')
      .update(updateData)
      .eq('id', existingLead.id);
  } else {
    // ── Round-robin: assign new lead to next team member ──
    let assignedTo: string | null = null;
    try {
      const { data: teamMembers } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: true });

      if (teamMembers && teamMembers.length > 0) {
        const counter = (tenant.lead_assignment_counter as number) ?? 0;
        const idx = counter % teamMembers.length;
        assignedTo = teamMembers[idx].id as string;
        // Increment counter for next lead (non-blocking)
        void supabaseAdmin
          .from('tenants')
          .update({ lead_assignment_counter: counter + 1 })
          .eq('id', tenant.id);
      }
    } catch {
      // Assignment failed — lead is created unassigned, not a blocker
    }

    // Create new lead
    const { data: newLead } = await supabaseAdmin
      .from('leads')
      .insert({
        tenant_id: tenant.id,
        phone: cleanPhone,
        channel: 'whatsapp',
        lead_status: 'new',
        lead_score: isFromAd ? 30 : 10,
        source: leadSource,
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        ...(assignedTo && { assigned_to: assignedTo }),
        ...(isFromAd && msg.referral && {
          notes: `Meta Ad — "${msg.referral.headline || ''}" | Ad ID: ${msg.referral.source_id || ''} | CLID: ${msg.referral.ctwa_clid || ''}`,
        }),
      })
      .select()
      .single();
    lead = newLead;
    if (isFromAd) {
      console.log(`📢 CTWA lead: ad="${msg.referral?.headline}" clid=${msg.referral?.ctwa_clid}`);
    }
    // Fire integrations for new lead event (non-blocking)
    if (newLead) {
      fireIntegrations({
        type: 'new_lead',
        tenantId: tenant.id as string,
        lead: {
          name: (newLead.name as string) || '',
          phone: cleanPhone,
          email: (newLead.email as string) || '',
          lead_status: 'new',
          source: leadSource,
        },
      }).catch(e => console.error('Integration runner (new_lead):', (e as Error).message));

      // Auto-sync to Google Sheets if connected (non-blocking, silently skip if not configured)
      appendLeadRow(tenant.id as string, {
        name:        (newLead.name as string) || undefined,
        phone:       cleanPhone,
        email:       (newLead.email as string) || undefined,
        lead_status: 'new',
        source:      leadSource,
        lead_score:  isFromAd ? 30 : 10,
        created_at:  new Date().toISOString(),
      }).catch(() => { /* Google Sheets not connected — expected */ });
    }
  }

  // ── Resolve or create Conversation ──
  let conversation: Record<string, unknown> | null = null;

  const { data: existingConv } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('sender_id', cleanPhone)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existingConv) {
    conversation = existingConv;
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', existingConv.id);
  } else {
    const { data: newConv } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenant.id,
        lead_id: lead?.id || null,
        channel: 'whatsapp',
        sender_id: cleanPhone,
        sender_name: null,
        current_step: 'greeting',
        is_active: true,
        bot_paused: false,
        escalated: false,
        ai_model_used: 'gemini-2.0-flash',
        ai_tokens_used: 0,
        message_count: 0,
        last_message_at: new Date().toISOString(),
        context: {},
      })
      .select()
      .single();
    conversation = newConv;
  }

  if (!conversation) {
    console.error('❌ Gupshup: failed to resolve conversation');
    return;
  }

  // ── Broadcast reply tracking (non-blocking) ──
  try {
    const redis = getRedisClient();
    if (redis) {
      const broadcastKey = `broadcast:phone:${tenant.id}:${cleanPhone}`;
      const campaignId = await redis.get(broadcastKey);
      if (campaignId) {
        await redis.del(broadcastKey);
        const { data: campaign } = await supabaseAdmin
          .from('broadcast_campaigns')
          .select('replied_count')
          .eq('id', campaignId)
          .single();
        if (campaign) {
          await supabaseAdmin
            .from('broadcast_campaigns')
            .update({ replied_count: ((campaign.replied_count as number) || 0) + 1 })
            .eq('id', campaignId);
        }
      }
    }
  } catch { /* non-critical */ }

  // ── P2-3: Insert inbound message — safe duplicate-check-then-insert ──
  // NOTE: upsert with onConflict:'wa_message_id' requires a unique DB constraint
  // that may not exist. We use a manual check instead to avoid crashes.
  if (msg.messageId) {
    const { data: existing } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('wa_message_id', msg.messageId)
      .maybeSingle();
    if (existing) {
      console.log(`⚠️ Duplicate inbound message ignored: ${msg.messageId}`);
      return;
    }
  }

  const { error: insertErr } = await supabaseAdmin.from('messages').insert({
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    direction: 'inbound',
    content: msg.text,
    message_type: msg.type === 'text' ? 'text' : 'image',
    channel: 'whatsapp',
    sender_id: cleanPhone,
    status: 'delivered',
    ai_generated: false,
    wa_message_id: msg.messageId,
  });
  if (insertErr) {
    console.error('❌ Message insert failed:', insertErr.message);
    return;
  }
  console.log(`✅ Inbound message saved: "${msg.text}" from ${cleanPhone}`);

  // ── Update conversation message count ──
  try {
    await supabaseAdmin.rpc('increment_message_count_conv', { conv_id: conversation.id });
  } catch {
    // Non-critical — proceed without incrementing
  }

  // ── Update conversation last_message_at NOW (before AI) ──
  // This fires Supabase Realtime immediately so the sidebar re-orders
  // and shows the new message within ~500ms, not after AI completes.
  void supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // ── Fire outbound webhook (non-blocking) ──
  const outboundUrl = (tenant as Record<string, unknown>).outbound_webhook_url as string | undefined;
  if (outboundUrl) {
    fetch(outboundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'inbound_message',
        tenant_id: tenant.id,
        phone: cleanPhone,
        message: msg.text,
        conversation_id: conversation.id,
        timestamp: new Date().toISOString(),
      }),
    }).catch(e => console.error('Outbound webhook error:', (e as Error).message));
  }

  // ── Skip AI if bot is paused or conversation is escalated ──
  if (conversation.bot_paused || conversation.escalated) {
    console.log(`🔇 Gupshup: bot paused for conversation ${conversation.id}, skipping AI`);
    return;
  }

  // ── P2-4: AI cost cap — skip Gemini if tenant is over their monthly limit ──
  const aiLimit = (tenant.ai_conversation_limit as number) ?? 1000;
  const aiUsed = (tenant.ai_conversations_this_month as number) ?? 0;
  if (aiUsed >= aiLimit) {
    console.log(`⚠️ Tenant ${tenant.id} hit AI limit (${aiUsed}/${aiLimit}). Skipping AI reply.`);
    return;
  }

  // isFirstMessage: conversation.message_count is 0 when just created (before RPC increment)
  // or 1 right after the first increment — both mean "no prior AI exchange existed"
  const isFirstMessage = ((conversation.message_count as number) ?? 0) <= 1;

  // ── Flow engine — run active flows before Gemini ──
  // If a flow handles the message (sends a reply), skip the AI call entirely.
  try {
    const flowHandled = await runFlowsForMessage(
      tenant.id as string,
      msg.text,
      cleanPhone,
      conversation.id as string,
      (lead?.id ?? null) as string | null,
      isFirstMessage
    );
    if (flowHandled) {
      console.log(`✅ Flow engine handled message for conversation ${conversation.id}, skipping AI`);
      return;
    }
  } catch (flowErr) {
    console.error('❌ Flow engine error (falling back to AI):', (flowErr as Error).message);
  }

  // ── Get recent conversation history for context ──
  const { data: recentMsgs } = await supabaseAdmin
    .from('messages')
    .select('direction, content')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const history = (recentMsgs || [])
    .reverse()
    .slice(0, -1) // Exclude the message we just inserted
    .map(m => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

  // ── Call AI engine ──
  // Use message_count (pre-increment, from the conversations row we fetched) as the
  // primary "is this the first message?" signal. history.length can be 0 even for
  // repeat messages when prior AI replies failed to save — making it unreliable alone.
  const storedMsgCount = (conversation.message_count as number) ?? 0;
  const isFirstMessageForAI = storedMsgCount === 0 && history.length === 0;

  // Load active smart rules + knowledge docs in parallel (non-blocking)
  const [{ data: smartRulesRows }, { data: agentRows }, ragDocs] = await Promise.all([
    supabaseAdmin
      .from('smart_rules')
      .select('name, trigger_source, ai_summary')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active'),
    supabaseAdmin
      .from('agent_configs')
      .select('agent_name, routing_keywords, bot_name, bot_personality, system_prompt')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true),
    // RAG: semantic search for relevant docs (falls back to [] if no embeddings yet)
    retrieveRelevantDocs(tenant.id as string, msg.text || '', 3).catch(() => []),
  ]);

  // If RAG returned nothing (e.g. docs not yet embedded), fall back to bulk load
  let knowledgeRows: Array<{ filename: string; content_text: string }> = ragDocs;
  if (ragDocs.length === 0) {
    const { data: fallback } = await supabaseAdmin
      .from('knowledge_docs')
      .select('filename, content_text')
      .eq('tenant_id', tenant.id)
      .neq('content_text', '')
      .limit(5);
    knowledgeRows = (fallback || []) as Array<{ filename: string; content_text: string }>;
  }

  // ── Multi-agent routing: pick agent whose keywords match the message ──
  const lowerMsgText = msg.text?.toLowerCase() ?? '';
  type AgentRow = { agent_name: string; routing_keywords: string[]; bot_name?: string; bot_personality?: string; system_prompt?: string };
  const matchedAgent = (agentRows as AgentRow[] | null)?.find(agent =>
    agent.routing_keywords?.some((kw: string) => lowerMsgText.includes(kw.toLowerCase()))
  ) ?? null;

  const baseConfig = getTenantConfig(tenant as unknown as Parameters<typeof getTenantConfig>[0]);
  const tenantConfig = {
    ...baseConfig,
    isFirstMessage: isFirstMessageForAI,
    smartRules: (smartRulesRows || []) as Array<{ name: string; trigger_source: string; ai_summary: string }>,
    knowledgeDocs: (knowledgeRows || []) as Array<{ filename: string; content_text: string }>,
    // Agent overrides (only non-empty values replace base config)
    ...(matchedAgent ? {
      botName:        matchedAgent.bot_name        || baseConfig.botName,
      botPersonality: matchedAgent.bot_personality || baseConfig.botPersonality,
    } : {}),
  };
  const context = (conversation.context as Record<string, unknown>) || {};

  let aiResponse: Awaited<ReturnType<typeof processMessageWithAI>>;
  try {
    aiResponse = await processMessageWithAI(
      msg.text,
      history,
      context,
      tenantConfig,
      tenant.id as string
    );
  } catch (err) {
    console.error('❌ Gupshup: AI engine error:', err);
    return;
  }

  if (!aiResponse?.reply) return;

  // ── Razorpay Payment Link injection ──
  if (aiResponse.extractedData?.requestPayment === 'true') {
    const amount = parseFloat(aiResponse.extractedData?.paymentAmount || '0');
    if (amount > 0) {
      const link = await createPaymentLink({
        amount,
        description: `Payment for ${(tenant as { business_name?: string }).business_name || 'booking'}`,
        customerName:  aiResponse.extractedData?.name    || undefined,
        customerPhone: cleanPhone,
        customerEmail: aiResponse.extractedData?.email   || undefined,
      }).catch(() => null);
      if (link) {
        aiResponse.reply = `${aiResponse.reply}\n\n💳 Pay here: ${link}`;
      }
    }
  }

  // ── Send AI reply via Gupshup ──
  let gupshupMsgId: string | null = null;
  try {
    const result = await sendTextMessage(
      decryptToken(tenant.gupshup_api_key as string) as string,
      tenant.gupshup_phone_number as string,
      cleanPhone,
      aiResponse.reply,
      tenant.gupshup_app_name as string
    );
    gupshupMsgId = result.messageId;
  } catch (sendErr) {
    console.error('❌ Gupshup: failed to send AI reply:', (sendErr as Error).message);
    // Still insert the message as failed
  }

  // ── Insert AI outbound message ──
  const { error: aiMsgErr } = await supabaseAdmin.from('messages').insert({
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    direction: 'outbound',
    content: aiResponse.reply,
    message_type: 'text',
    channel: 'whatsapp',
    sender_id: null,
    status: gupshupMsgId ? 'sent' : 'failed',
    ai_generated: true,
    wa_message_id: gupshupMsgId,
  });
  if (aiMsgErr) {
    console.error('❌ Gupshup: failed to save AI outbound message (history will be incomplete):', aiMsgErr.message);
  }

  // ── Update conversation context ──
  const updatedContext = { ...context, ...aiResponse.extractedData };
  await supabaseAdmin
    .from('conversations')
    .update({
      context: updatedContext,
      current_step: aiResponse.nextStep,
      last_message_at: new Date().toISOString(),
      escalated: aiResponse.shouldEscalate,
      escalated_at: aiResponse.shouldEscalate ? new Date().toISOString() : null,
      escalation_reason: aiResponse.escalationReason || null,
    })
    .eq('id', conversation.id);

  // ── Update lead score from AI ──
  if (lead?.id && aiResponse.intent) {
    const scoreMap: Record<string, number> = {
      human_request: 60, complaint: 30, reserve_table: 80, private_event: 85,
      corporate_booking: 90, confirm: 95, cancel: 20, pricing: 65,
      general_enquiry: 40, greeting: 20, unknown: 10,
    };
    const newScore = scoreMap[aiResponse.intent] ?? (lead.lead_score as number);
    const newStatus = newScore >= 80 ? 'hot' : newScore >= 50 ? 'warm' : 'cold';

    await supabaseAdmin
      .from('leads')
      .update({ lead_score: newScore, lead_status: newStatus })
      .eq('id', lead.id);
  }

  console.log(`✅ Gupshup: processed message from ${cleanPhone}, AI intent: ${aiResponse.intent}`);
}

// ═══════════════════════════════════════
// HANDLER: Message Status Update
// ═══════════════════════════════════════
async function handleStatusUpdate(
  msg: NonNullable<ReturnType<typeof parseGupshupWebhook>>
) {
  // Log the full raw status so we can see Meta error codes (131026, 131047 etc.)
  console.log('📬 Gupshup STATUS RAW:', JSON.stringify(msg).slice(0, 800));

  if (!msg.messageId || !msg.status) return;

  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    enqueued: 'sent',
    processing: 'sent',
  };

  const mappedStatus = statusMap[msg.status] || msg.status;

  // Fetch the current message status first to prevent out-of-order webhook status overwrites (e.g. read arriving before delivered)
  const { data: currentMsg, error: fetchErr } = await supabaseAdmin
    .from('messages')
    .select('status')
    .eq('wa_message_id', msg.messageId)
    .maybeSingle();

  if (fetchErr) {
    console.error(`❌ Gupshup status update: failed to fetch current status: ${fetchErr.message}`);
    return;
  }

  if (!currentMsg) {
    console.warn(`⚠️ Gupshup status update: No message matched wa_message_id="${msg.messageId}" in DB.`);
    return;
  }

  const currentStatus = currentMsg.status;

  // Rules to prevent status downgrade:
  let allowUpdate = true;
  if (currentStatus === 'read') {
    allowUpdate = false; // Once read, it stays read forever
  } else if (currentStatus === 'delivered') {
    allowUpdate = (mappedStatus === 'read'); // Once delivered, it can only go to read
  } else if (currentStatus === 'failed') {
    allowUpdate = (mappedStatus === 'delivered' || mappedStatus === 'read'); // Allow recovery if it actually succeeded
  }

  if (!allowUpdate) {
    console.log(`📬 Gupshup status update ignored (downgrade prevention): ${msg.messageId} is already "${currentStatus}", new is "${mappedStatus}"`);
    return;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('messages')
    .update({ status: mappedStatus })
    .eq('wa_message_id', msg.messageId)
    .select('id');

  if (error) {
    console.error(`❌ Gupshup status update DB error: ${error.message}`);
  } else if (!updated || updated.length === 0) {
    console.warn(`⚠️ Gupshup status update: No message matched wa_message_id="${msg.messageId}" in DB.`);
  } else {
    console.log(`📬 Gupshup status update success: ${msg.messageId} → ${mappedStatus} (updated message ${updated[0].id})`);
  }
}
