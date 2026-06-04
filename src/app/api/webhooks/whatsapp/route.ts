// ═══════════════════════════════════════════════════════════
// 📥 Meta WhatsApp Webhook Handler (Multi-Tenant)
// ═══════════════════════════════════════════════════════════
// Handles Meta's webhook verification handshake (GET) and
// processes incoming messages and status updates (POST).
// Uses after() to keep responses under Meta's 5s timeout.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isDuplicateMessage, getRedisClient } from '@/lib/redis/client';
import { createPaymentLink } from '@/lib/payments/razorpay-links';
import { retrieveRelevantDocs } from '@/lib/ai/rag';
import { appendLeadRow, appendBookingRow } from '@/lib/integrations/google-sheets';
import { parseMetaWebhook, sendTextMessage, getMediaUrl, verifySignature } from '@/lib/meta/service';
import { processMessageWithAI } from '@/lib/ai/engine';
import { getTenantByPhoneNumberId, getTenantConfig } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { runFlowsForMessage } from '@/lib/flows/engine';
import { fireIntegrations, createBookingPaymentLink } from '@/lib/integrations/runner';
import { sendLeadAssignedEmail } from '@/lib/email/service';

// ── GET: Webhook Verification Handshake ──
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token) {
    // 1. Check global system verification token (accept both env var names)
    const systemVerifyToken = process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
    if (systemVerifyToken && token === systemVerifyToken) {
      console.log('✅ Meta Webhook: Verified via global system token.');
      return new Response(challenge, { status: 200 });
    }

    // 2. Fallback: Search tenants for matching token
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('wa_verify_token', token)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (tenant) {
      console.log(`✅ Meta Webhook: Verified via tenant token (Tenant: ${tenant.id}).`);
      return new Response(challenge, { status: 200 });
    }
  }

  console.warn(`⚠️ Meta Webhook: verification handshake failed. Mode: ${mode}, Token: ${token}`);
  return new Response('Forbidden', { status: 403 });
}

// ── POST: Event Event Dispatcher ──
export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const rawBody = await req.text();

  if (appSecret && !verifySignature(rawBody, signature, appSecret)) {
    console.warn('❌ Meta Webhook: signature verification failed');
    return new Response('Unauthorized', { status: 401 });
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.error('❌ Meta Webhook: failed to parse JSON body:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to prevent retries
  }

  // Parse Meta Payload
  const parsed = parseMetaWebhook(body);
  if (!parsed) {
    return NextResponse.json({ ok: true });
  }

  // Defer heavy execution using Next.js after() to return 200 quickly
  after(async () => {
    try {
      await processWebhookAsync(parsed);
    } catch (err) {
      console.error('❌ Meta Webhook processing error:', err);
    }
  });

  return NextResponse.json({ ok: true });
}

// ── Async Process Webhook Payload ──
async function processWebhookAsync(parsed: NonNullable<ReturnType<typeof parseMetaWebhook>>) {
  if (parsed.isStatusUpdate) {
    await handleStatusUpdate(parsed);
    return;
  }

  if (parsed.isReaction) {
    await handleIncomingReaction(parsed);
    return;
  }

  await handleIncomingMessage(parsed);
}

// ── Inbound Message Processing ──
async function handleIncomingMessage(msg: NonNullable<ReturnType<typeof parseMetaWebhook>>) {
  if (!msg.messageId || !msg.fromPhone || !msg.appPhoneId) {
    console.warn('⚠️ Meta Webhook: skipping message with missing identifiers');
    return;
  }

  // 1. Early dedup soft-check (non-atomic, just quick filter)
  const isDup = await isDuplicateMessage(msg.messageId);
  if (isDup) {
    console.log(`⚡ Meta Webhook: duplicate message skipped early: ${msg.messageId}`);
    return;
  }

  // 2. Resolve Tenant by App Phone Number ID
  const tenant = await getTenantByPhoneNumberId(msg.appPhoneId);
  if (!tenant) {
    console.error(`❌ Meta Webhook: no tenant found with wa_phone_number_id="${msg.appPhoneId}"`);
    return;
  }

  console.log(`✅ Meta Webhook: tenant resolved: ${tenant.business_name} (${tenant.id})`);

  // 3. Resolve Media URL if this is a media message
  let content = msg.text;
  if (msg.mediaId) {
    const decryptedToken = decryptToken(tenant.wa_access_token);
    if (decryptedToken) {
      const mediaUrl = await getMediaUrl(decryptedToken, msg.mediaId);
      if (mediaUrl) {
        content = mediaUrl;
        console.log(`📸 Resolved Meta media ID "${msg.mediaId}" to URL: ${mediaUrl.slice(0, 100)}...`);
      }
    }
  }

  // 4. Resolve/Create Lead
  const cleanPhone = msg.fromPhone.replace(/\D/g, '');
  let lead: Record<string, any> | null = null;

  const { data: existingLead } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('phone', cleanPhone)
    .single();

  const isFromAd = !!msg.referral && msg.referral.source_type === 'ad';
  const leadSource = isFromAd ? 'meta_ctwa' : 'whatsapp';

  if (existingLead) {
    lead = existingLead;
    const updateData: Record<string, any> = { last_message_at: new Date().toISOString() };
    if (isFromAd && !existingLead.source) {
      updateData.source = leadSource;
    }
    await supabaseAdmin
      .from('leads')
      .update(updateData)
      .eq('id', existingLead.id);
  } else {
    // Round-robin assignment
    let assignedTo: string | null = null;
    let assignedMember: { id: string; email?: string; full_name?: string } | null = null;
    try {
      const { data: teamMembers } = await supabaseAdmin
        .from('users')
        .select('id, is_sales_agent, email, full_name')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: true });

      if (teamMembers && teamMembers.length > 0) {
        // Prefer the sales team for auto-assignment: Click-to-WhatsApp / Meta-ad
        // leads must land with sales. Fall back to all members if nobody is
        // flagged as a sales agent yet.
        const salesPool = teamMembers.filter((m: { is_sales_agent?: boolean }) => m.is_sales_agent);
        const pool = salesPool.length > 0 ? salesPool : teamMembers;
        const counter = (tenant.lead_assignment_counter as number) ?? 0;
        const idx = counter % pool.length;
        assignedMember = pool[idx];
        assignedTo = pool[idx].id;
        void supabaseAdmin
          .from('tenants')
          .update({ lead_assignment_counter: counter + 1 })
          .eq('id', tenant.id);
      }
    } catch (e) {
      console.warn('⚠️ Assignment failed:', e);
    }

    // Tracking campaign: tag the lead from (1) a ref code in the first message
    // (wa.me tracking links) or (2) the Meta ad it came from (Click-to-WhatsApp).
    let campaignId: string | null = null;
    let campaignName: string | undefined;
    try {
      const { data: campaigns } = await supabaseAdmin
        .from('lead_campaigns')
        .select('id, name, ref_code, meta_ad_id')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      const text = (msg.text || '').toLowerCase();
      let hit: { id: string; name: string } | undefined;

      // (1) ref code embedded in the message (e.g. "[4june]")
      if (text) {
        hit = (campaigns || []).find((c: { ref_code?: string }) => {
          if (!c.ref_code) return false;
          const esc = c.ref_code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`\\b${esc}\\b`).test(text);
        });
      }

      // (2) Meta ad id, when the lead came from a Click-to-WhatsApp ad
      const adId = isFromAd ? msg.referral?.source_id : undefined;
      if (!hit && adId) {
        hit = (campaigns || []).find((c: { meta_ad_id?: string }) =>
          !!c.meta_ad_id && c.meta_ad_id === adId);
      }

      if (hit) { campaignId = hit.id; campaignName = hit.name; }
    } catch {
      // lead_campaigns table may not be migrated yet — skip tagging gracefully
    }

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
        ...(campaignId && { campaign_id: campaignId }),
        ...(isFromAd && msg.referral && {
          notes: `Meta Ad — "${msg.referral.headline || ''}" | Ad ID: ${msg.referral.source_id || ''} | CLID: ${msg.referral.ctwa_clid || ''}`,
        }),
      })
      .select()
      .single();

    lead = newLead;

    if (newLead) {
      // Fire lead integration events
      fireIntegrations({
        type: 'new_lead',
        tenantId: tenant.id,
        lead: {
          name: newLead.name || '',
          phone: cleanPhone,
          email: newLead.email || '',
          lead_status: 'new',
          source: leadSource,
        },
      }).catch(e => console.error('Integration runner (new_lead):', e.message));

      appendLeadRow(tenant.id, {
        name: newLead.name || undefined,
        phone: cleanPhone,
        email: newLead.email || undefined,
        lead_status: 'new',
        source: leadSource,
        campaign: campaignName,
        lead_score: isFromAd ? 30 : 10,
        created_at: new Date().toISOString(),
      }).catch(() => {});

      // Notify the assigned sales agent about high-intent ad leads (email).
      if (isFromAd && assignedMember?.email) {
        sendLeadAssignedEmail(
          assignedMember.email,
          newLead.name || cleanPhone,
          (tenant.business_name as string) || 'your business',
          'Meta Ad'
        ).catch(() => {});
      }
    }
  }

  // 5. Resolve/Create Conversation
  let conversation: Record<string, any> | null = null;

  const { data: existingConv } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('sender_id', cleanPhone)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingConv) {
    conversation = existingConv;
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', existingConv.id);
  } else {
    const { data: newConv, error: convInsertErr } = await supabaseAdmin
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
        ai_model_used: 'gemini-2.5-flash',
        ai_tokens_used: 0,
        message_count: 0,
        last_message_at: new Date().toISOString(),
        context: {},
      })
      .select()
      .single();

    if (convInsertErr) {
      const { data: reFetched } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('sender_id', cleanPhone)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      conversation = reFetched;
    } else {
      conversation = newConv;
      
      // Deduplicate parallel inserts
      const { data: allActive } = await supabaseAdmin
        .from('conversations')
        .select('id, created_at')
        .eq('tenant_id', tenant.id)
        .eq('sender_id', cleanPhone)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (allActive && allActive.length > 1) {
        const keepId = allActive[0].id;
        const dupeIds = allActive.slice(1).map(c => c.id);
        await supabaseAdmin.from('conversations').delete().in('id', dupeIds);
        if (newConv && newConv.id !== keepId) {
          const { data: canonical } = await supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('id', keepId)
            .single();
          conversation = canonical;
        }
      }
    }
  }

  if (!conversation) {
    console.error('❌ Meta Webhook: failed to resolve conversation');
    return;
  }

  // 6. Broadcast reply tracking (non-blocking)
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
  } catch {}

  // 7 + 8. ATOMIC DISTRIBUTED LOCK: Insert inbound message as the dedup gate.
  // The DB has a unique index on wa_message_id. If 3 concurrent webhook calls all
  // pass the soft-check above, only ONE can insert successfully.
  // The others get a unique_violation (code 23505) → return immediately.
  // This permanently eliminates triple/duplicate replies.
  const isMedia = ['image', 'video', 'audio', 'document', 'voice'].includes(msg.type);
  const inboundMsgPayload = {
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    direction: 'inbound' as const,
    content,
    message_type: isMedia ? msg.type : 'text',
    channel: 'whatsapp',
    sender_id: cleanPhone,
    status: 'delivered',
    ai_generated: false,
    wa_message_id: msg.messageId,
    ...(isMedia && {
      media_url: content,
      file_name: msg.mediaFilename || `${msg.type}_${msg.messageId}.${msg.mediaMimeType?.split('/')?.[1]?.split(';')?.[0] || 'bin'}`,
      mime_type: msg.mediaMimeType || (msg.type === 'image' ? 'image/jpeg' : msg.type === 'video' ? 'video/mp4' : msg.type === 'audio' || msg.type === 'voice' ? 'audio/ogg' : 'application/octet-stream'),
      media_caption: msg.mediaCaption || null,
    }),
  };

  const { error: insertErr } = await supabaseAdmin.from('messages').insert(inboundMsgPayload);

  if (insertErr) {
    // code 23505 = unique_violation — another concurrent request already processing this message
    if (insertErr.code === '23505' || insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
      console.log(`⚡ Concurrent duplicate blocked at insert: ${msg.messageId}`);
      return;
    }
    console.error('❌ Message insert failed:', insertErr.message);
    return;
  }

  console.log(`✅ Inbound message saved: "${content.slice(0, 100)}" from ${cleanPhone}`);

  // Increment message counter
  try {
    await supabaseAdmin.rpc('increment_message_count_conv', { conv_id: conversation.id });
  } catch {}

  // Update conversation last_message_at for UI responsiveness
  void supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // 9. Fire Outbound Integration Webhook
  const outboundUrl = tenant.outbound_webhook_url;
  if (outboundUrl) {
    fetch(outboundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'inbound_message',
        tenant_id: tenant.id,
        phone: cleanPhone,
        message: content,
        conversation_id: conversation.id,
        timestamp: new Date().toISOString(),
      }),
    }).catch(e => console.error('Outbound webhook error:', e.message));
  }

  // 10. Pause / Escalated checks
  // bot_paused = hard stop (human agent has taken over — never override)
  if (conversation.bot_paused) {
    console.log(`🔇 Meta: bot paused (human takeover) for conversation ${conversation.id}, skipping AI`);
    return;
  }

  // escalated = soft state — if booking is already saved, auto-clear so bot can handle follow-up
  if (conversation.escalated) {
    const ctx = (conversation.context as Record<string, any>) || {};
    if (ctx.booking_saved) {
      // Auto-clear escalation after a completed booking so bot handles follow-up messages
      console.log(`🔄 Auto-clearing escalation for conversation ${conversation.id} (booking already saved)`);
      await supabaseAdmin
        .from('conversations')
        .update({ escalated: false, escalation_reason: null })
        .eq('id', conversation.id);
      conversation.escalated = false;
    } else {
      // Still in escalation with no completed booking — skip AI (human should handle)
      console.log(`🔇 Meta: conversation ${conversation.id} escalated (no booking), skipping AI`);
      return;
    }
  }


  // 11. AI Cost Cap Checks
  const aiLimit = tenant.ai_conversation_limit ?? 1000;
  const aiUsed = tenant.ai_conversations_this_month ?? 0;
  if (aiUsed >= aiLimit) {
    console.log(`⚠️ Tenant ${tenant.id} hit AI limit (${aiUsed}/${aiLimit}). Skipping AI reply.`);
    return;
  }

  const isFirstMessage = (conversation.message_count ?? 0) <= 1;

  // 12. Flow Engine Execution
  try {
    const flowHandled = await runFlowsForMessage(
      tenant.id,
      msg.text,
      cleanPhone,
      conversation.id,
      lead?.id ?? null,
      isFirstMessage
    );
    if (flowHandled) {
      console.log(`✅ Flow engine handled message for conversation ${conversation.id}, skipping AI`);
      return;
    }
  } catch (flowErr) {
    console.error('❌ Flow engine error (falling back to AI):', (flowErr as Error).message);
  }

  // 13. Get Conversation History
  const { data: recentMsgs } = await supabaseAdmin
    .from('messages')
    .select('direction, content')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const history = (recentMsgs || [])
    .reverse()
    .slice(0, -1) // Exclude current message
    .map(m => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

  const storedMsgCount = conversation.message_count ?? 0;
  const isFirstMessageForAI = storedMsgCount === 0 && history.length === 0;

  // Load Smart Rules + Agent configs + Knowledge docs in parallel
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
    retrieveRelevantDocs(tenant.id, msg.text, 3).catch(() => []),
  ]);

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

  const lowerMsgText = msg.text.toLowerCase();
  type AgentRow = { agent_name: string; routing_keywords: string[]; bot_name?: string; bot_personality?: string; system_prompt?: string };
  const matchedAgent = (agentRows as AgentRow[] | null)?.find(agent =>
    agent.routing_keywords?.some((kw: string) => lowerMsgText.includes(kw.toLowerCase()))
  ) ?? null;

  const baseConfig = getTenantConfig(tenant);
  const tenantConfig = {
    ...baseConfig,
    isFirstMessage: isFirstMessageForAI,
    smartRules: (smartRulesRows || []) as Array<{ name: string; trigger_source: string; ai_summary: string }>,
    knowledgeDocs: knowledgeRows,
    ...(matchedAgent ? {
      botName: matchedAgent.bot_name || baseConfig.botName,
      botPersonality: matchedAgent.bot_personality || baseConfig.botPersonality,
      systemPrompt: matchedAgent.system_prompt || baseConfig.systemPrompt,
    } : {}),
  };
  const context = (conversation.context as Record<string, any>) || {};

  let aiResponse;
  try {
    aiResponse = await processMessageWithAI(
      msg.text,
      history,
      context,
      tenantConfig,
      tenant.id
    );
  } catch (err) {
    console.error('❌ Meta: AI engine error:', err);
    return;
  }

  if (!aiResponse?.reply) return;

  // 14. Payment Links Injection
  if (aiResponse.extractedData?.requestPayment === 'true') {
    const amount = parseFloat(aiResponse.extractedData?.paymentAmount || '0');
    if (amount > 0) {
      const link = await createPaymentLink({
        amount,
        description: `Payment for ${tenant.business_name || 'booking'}`,
        customerName: aiResponse.extractedData?.name || undefined,
        customerPhone: cleanPhone,
        customerEmail: aiResponse.extractedData?.email || undefined,
      }).catch(() => null);
      if (link) {
        aiResponse.reply = `${aiResponse.reply}\n\n💳 Pay here: ${link}`;
      }
    }
  }

  // 15. Send reply via Meta
  let metaMsgId: string | null = null;
  const decryptedToken = decryptToken(tenant.wa_access_token);
  if (!decryptedToken || !tenant.wa_phone_number_id) {
    console.error(`❌ Meta: missing credentials to send AI reply for tenant ${tenant.id}`);
  } else {
    try {
      const result = await sendTextMessage(
        decryptedToken,
        tenant.wa_phone_number_id,
        cleanPhone,
        aiResponse.reply
      );
      metaMsgId = result.messageId;
    } catch (sendErr) {
      console.error('❌ Meta: failed to send AI reply:', (sendErr as Error).message);
    }
  }

  // 16. Save Outbound AI Reply
  const { error: aiMsgErr } = await supabaseAdmin.from('messages').insert({
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    direction: 'outbound',
    content: aiResponse.reply,
    message_type: 'text',
    channel: 'whatsapp',
    sender_id: null,
    status: metaMsgId ? 'sent' : 'failed',
    ai_generated: true,
    wa_message_id: metaMsgId,
  });

  if (aiMsgErr) {
    console.error('❌ Meta: failed to save AI outbound message:', aiMsgErr.message);
  }

  // 17. Update Conversation Context
  const updatedContext = { ...context, ...aiResponse.extractedData };

  // Reset booking_saved when a NEW booking flow starts (so repeat bookings work)
  // If AI is asking for guests/date/name = new booking, clear the old saved flag
  const newBookingIntents = ['reserve_table', 'private_event', 'corporate_booking'];
  const newBookingSteps = ['ask_guests', 'ask_date', 'ask_time', 'ask_name', 'ask_phone'];
  const isNewBookingFlow = 
    newBookingIntents.includes(aiResponse.intent) ||
    newBookingSteps.includes(aiResponse.nextStep);
  
  if (isNewBookingFlow && (updatedContext as Record<string, any>).booking_saved) {
    console.log(`🔄 New booking flow detected — resetting booking_saved flag`);
    const uc = updatedContext as Record<string, any>;
    uc.booking_saved = false;
    uc.booking_reservation_id = null;
    // Also clear old booking data so fresh data gets used
    uc.date = aiResponse.extractedData?.date || undefined;
    uc.time = aiResponse.extractedData?.time || undefined;
    uc.guestCount = aiResponse.extractedData?.guestCount || undefined;
    uc.name = aiResponse.extractedData?.name || undefined;
    uc.phone = aiResponse.extractedData?.phone || undefined;
  }


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


  // 18. Update Lead Score
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

  // 19. Auto-Save AI Booking to Database & Google Sheets
  const contextObj = updatedContext as Record<string, any>;
  const bookingDateRaw = contextObj.date || contextObj.booking_date;
  const bookingTimeRaw = contextObj.time || contextObj.booking_time;
  const bookingGuestsRaw = contextObj.guestCount || contextObj.party_size;
  const customerPhone = contextObj.phone || cleanPhone; // use context phone if captured, else WhatsApp number

  const replyLower = aiResponse.reply.toLowerCase();
  
  // Detect booking confirmation signals from AI reply
  const hasConfirmSignal =
    aiResponse.intent === 'confirm' ||
    aiResponse.nextStep === 'completed' ||
    aiResponse.nextStep === 'confirmation' ||
    replyLower.includes('confirmed') ||
    replyLower.includes('booking is confirmed') ||
    replyLower.includes('table is confirmed') ||
    replyLower.includes('reservation is confirmed') ||
    replyLower.includes('booked for') ||
    replyLower.includes('table for') ||
    replyLower.includes('reservation for');

  const hasBookingData = !!(bookingDateRaw && bookingTimeRaw && bookingGuestsRaw);
  const alreadySaved = !!contextObj.booking_saved;

  console.log(`📋 [BOOKING CHECK] signal=${hasConfirmSignal} data=${hasBookingData} saved=${alreadySaved} date="${bookingDateRaw}" time="${bookingTimeRaw}" guests="${bookingGuestsRaw}"`);

  const isAIConfirmBooking = hasConfirmSignal && hasBookingData && !alreadySaved;

  if (isAIConfirmBooking) {
    try {
      console.log(`🤖 [AI AUTO-BOOK] Saving booking for tenant ${tenant.business_name || tenant.id}...`);
      
      const shortCode = tenant.short_code || 'RES';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const seq = Math.floor(Math.random() * 9000) + 1000;
      const reservationId = `${shortCode}-${dateStr}-${seq}`;
      
      const guestCount = parseInt(String(bookingGuestsRaw)) || 2;
      const customerName = contextObj.name || lead?.name || 'Customer';
      
      // Parse the freeform datetime from context
      const rawDateTime = `${bookingDateRaw} ${bookingTimeRaw}`;
      const { bookingDate, slotTime } = parseDatetime(rawDateTime);
      console.log(`   ↳ Datetime raw: "${rawDateTime}" → date=${bookingDate} time=${slotTime}`);
      console.log(`   ↳ Customer: ${customerName} | Phone: ${customerPhone} | Guests: ${guestCount}`);

      // ── Booking commitment fee: generate Razorpay link if configured ──────
      const feePerPerson = Number((tenant as any).booking_fee_per_person) || 0;
      const feeRupees    = feePerPerson > 0 ? feePerPerson * guestCount : 0;
      let paymentLink: { id: string; short_url: string } | null = null;
      if (feeRupees > 0) {
        try {
          paymentLink = await createBookingPaymentLink(
            tenant.id,
            { name: customerName, phone: customerPhone },
            feeRupees,
            `Booking fee for ${guestCount} guest(s) at ${(tenant as any).business_name || 'restaurant'} — ${reservationId}`,
            reservationId
          );
          console.log(`   💳 Razorpay link created: ${paymentLink?.short_url}`);
        } catch (rzErr: any) {
          console.error('   ❌ Razorpay link creation failed:', rzErr.message);
        }
      }
      const isPrepaid    = !!paymentLink;
      const payStatus    = isPrepaid ? 'pending' : 'paid';
      const payAmount    = isPrepaid ? Math.round(feeRupees * 100) : 0; // paise

      const bookingPayload = {
        reservation_id: reservationId,
        customer_name: customerName,
        customer_phone: customerPhone,
        party_size: guestCount,
        slot_time: slotTime,
        booking_date: bookingDate,
        booking_status: 'confirmed',
        payment_status: payStatus,
        payment_amount: isPrepaid ? feeRupees : 0, // rupees for Sheets
        created_at: new Date().toISOString(),
        special_request: contextObj.specialRequests || '',
      };

      // 1. Sync to Google Sheets — await so we can log success/failure
      try {
        await appendBookingRow(tenant.id, bookingPayload);
        console.log(`   ✅ Google Sheets booking row saved successfully.`);
      } catch (sheetsErr: any) {
        console.error(`   ❌ Google Sheets booking save FAILED: ${sheetsErr.message}`);
      }

      // 2. Insert into Supabase restaurant_bookings
      const { data: slots } = await supabaseAdmin
        .from('restaurant_slots')
        .select('id')
        .eq('restaurant_id', tenant.id)
        .eq('is_active', true)
        .limit(1);

      let slotId: string | null = slots?.[0]?.id || null;

      if (!slotId) {
        const { data: newSlot } = await supabaseAdmin
          .from('restaurant_slots')
          .insert({
            restaurant_id: tenant.id,
            slot_time: '19:30:00',
            day_type: 'both',
            total_capacity: 50,
            is_active: true
          })
          .select()
          .single();
        if (newSlot) slotId = newSlot.id;
      }

      if (slotId) {
        const { error: dbInsertErr } = await supabaseAdmin.from('restaurant_bookings').insert({
          restaurant_id: tenant.id,
          slot_id: slotId,
          booking_date: bookingDate,
          customer_name: customerName,
          customer_phone: customerPhone,
          party_size: guestCount,
          payment_amount: payAmount,
          payment_status: payStatus,
          booking_status: 'confirmed',
          reservation_id: reservationId,
          ...(paymentLink && { payment_link_url: paymentLink.short_url, payment_link_id: paymentLink.id }),
        });
        if (dbInsertErr) {
          console.error('❌ AI Auto-Book DB save failed:', dbInsertErr.message);
        } else {
          console.log(`   ✅ Saved to restaurant_bookings (ID: ${reservationId}, payment: ${payStatus}).`);
        }
      }

      // 2b. If payment required — override the AI reply with the payment link message
      //     so the customer gets the link right away in the same WhatsApp thread.
      if (isPrepaid && paymentLink) {
        const waToken    = decryptToken((tenant as any).wa_access_token) as string;
        const waPhoneId  = (tenant as any).wa_phone_number_id as string;
        if (waToken && waPhoneId) {
          const payMsg = `🎉 Almost done, ${customerName}!\n\nTo confirm your table for ${guestCount} guest${guestCount !== 1 ? 's' : ''} on ${bookingDate}, please pay the ₹${feeRupees} booking fee:\n\n💳 ${paymentLink.short_url}\n\nReservation ID: ${reservationId}`;
          sendTextMessage(waToken, waPhoneId, customerPhone, payMsg).catch(e =>
            console.error('❌ Failed to send payment link WA message:', (e as Error).message)
          );
        }
        // Also fire integrations (Pabbly / Calendar) for payment_requested
        fireIntegrations({
          type: 'payment_requested',
          tenantId: tenant.id,
          lead: { name: customerName, phone: customerPhone },
          amount: feeRupees,
          description: `Booking ${reservationId}`,
        }).catch(() => {});
      } else {
        // Free booking confirmed — fire booking_confirmed integrations
        fireIntegrations({
          type: 'booking_confirmed',
          tenantId: tenant.id,
          lead: { name: customerName, phone: customerPhone },
          details: { reservation_id: reservationId, party_size: String(guestCount), date: bookingDate, time: slotTime },
        }).catch(() => {});
      }

      // 3. Mark booking as saved in conversation context to prevent duplicates
      contextObj.booking_saved = true;
      contextObj.booking_reservation_id = reservationId;
      await supabaseAdmin
        .from('conversations')
        .update({ context: contextObj })
        .eq('id', conversation.id);
      console.log(`   ✅ Conversation context marked booking_saved=true.`);

    } catch (autoBookErr: any) {
      console.error('❌ AI Auto-Book error:', autoBookErr.message);
    }
  } else if (!alreadySaved && hasBookingData) {
    console.log(`📋 [BOOKING CHECK] Data present but no confirmation signal yet — waiting for explicit confirmation.`);
  }

  console.log(`✅ Meta: processed message from ${cleanPhone}, AI intent: ${aiResponse.intent}`);
}

// ── Message Status Update Parser ──
async function handleStatusUpdate(msg: NonNullable<ReturnType<typeof parseMetaWebhook>>) {
  console.log('📬 Meta Webhook STATUS RAW:', JSON.stringify(msg).slice(0, 800));

  if (!msg.messageId || !msg.status) return;

  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };

  const mappedStatus = statusMap[msg.status] || msg.status;

  const { data: currentMsg, error: fetchErr } = await supabaseAdmin
    .from('messages')
    .select('status')
    .eq('wa_message_id', msg.messageId)
    .maybeSingle();

  if (fetchErr) {
    console.error(`❌ Meta status update: failed to fetch current status: ${fetchErr.message}`);
    return;
  }

  if (!currentMsg) {
    // Not a chat message — may be a broadcast. Fall through to the broadcast reconciliation pipeline.
    console.log(`📬 Meta status update: "${msg.messageId}" not in messages table — checking broadcast_deliveries.`);
  } else {
    const currentStatus = currentMsg.status;

    let allowUpdate = true;
    if (currentStatus === 'read') {
      allowUpdate = false;
    } else if (currentStatus === 'delivered') {
      allowUpdate = (mappedStatus === 'read');
    } else if (currentStatus === 'failed') {
      allowUpdate = (mappedStatus === 'delivered' || mappedStatus === 'read');
    }

    if (!allowUpdate) {
      console.log(`📬 Meta status update ignored: ${msg.messageId} is already "${currentStatus}", new is "${mappedStatus}"`);
      return;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('messages')
      .update({ status: mappedStatus })
      .eq('wa_message_id', msg.messageId)
      .select('id');

    if (error) {
      console.error(`❌ Meta status update DB error: ${error.message}`);
    } else if (!updated || updated.length === 0) {
      console.warn(`⚠️ Meta status update: No message matched wa_message_id="${msg.messageId}" in DB.`);
    } else {
      console.log(`📬 Meta status update success: ${msg.messageId} → ${mappedStatus} (updated message ${updated[0].id})`);
    }
  }

  // ── Broadcast Delivery Reconciliation Pipeline ──
  try {
    const { data: updatedDelivery } = await supabaseAdmin
      .from('broadcast_deliveries')
      .update({
        status: mappedStatus,
        ...(mappedStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
        ...(mappedStatus === 'read' && { read_at: new Date().toISOString() })
      })
      .eq('message_id', msg.messageId)
      .select('campaign_id');

    if (updatedDelivery && updatedDelivery.length > 0) {
      const campaignId = updatedDelivery[0].campaign_id;
      const metricColMap: Record<string, string> = {
        delivered: 'delivered_count',
        read: 'read_count',
        failed: 'failed_count'
      };
      const colToIncrement = metricColMap[mappedStatus];
      if (colToIncrement) {
        await supabaseAdmin.rpc('increment_broadcast_analytics', {
          target_campaign_id: campaignId,
          col_name: colToIncrement
        });
      }
    }
  } catch (reconcileErr) {
    console.error('❌ Failed to reconcile broadcast deliveries:', reconcileErr);
  }
}

// ── Inbound Reaction Processing ──
async function handleIncomingReaction(msg: NonNullable<ReturnType<typeof parseMetaWebhook>>) {
  if (!msg.reactedToMessageId || !msg.appPhoneId) {
    console.warn('⚠️ Meta Webhook: skipping reaction with missing identifiers');
    return;
  }

  // 1. Resolve Tenant by App Phone Number ID
  const tenant = await getTenantByPhoneNumberId(msg.appPhoneId);
  if (!tenant) {
    console.error(`❌ Meta Webhook reaction: no tenant found with wa_phone_number_id="${msg.appPhoneId}"`);
    return;
  }

  const emoji = msg.reactionEmoji || null;
  console.log(`👍 Meta Webhook reaction: updating message ${msg.reactedToMessageId} to ${emoji || 'no reaction'}`);

  const { data: updated, error } = await supabaseAdmin
    .from('messages')
    .update({ reaction: emoji })
    .eq('tenant_id', tenant.id)
    .eq('wa_message_id', msg.reactedToMessageId)
    .select('id, conversation_id');

  if (error) {
    console.error(`❌ Meta Webhook reaction update failed: ${error.message}`);
  } else if (!updated || updated.length === 0) {
    console.warn(`⚠️ Meta Webhook reaction: No message matched wa_message_id="${msg.reactedToMessageId}" in DB.`);
  } else {
    console.log(`👍 Meta Webhook reaction: successfully updated reaction for message ${updated[0].id}`);
    
    // Update conversation last_message_at for UI responsiveness
    void supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', updated[0].conversation_id);
  }
}

// ── Parse a free-form datetime string ────────────────────
function parseDatetime(raw: string): { bookingDate: string; slotTime: string } {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + (5.5 * 60 * 60 * 1000)); // IST offset

  let bookingDate = istTime.toISOString().slice(0, 10);
  let slotTime = '19:30:00';

  try {
    const s = raw.trim().toLowerCase();

    // Construct baseDate as a pure UTC date representing the IST day
    const baseDate = new Date(Date.UTC(
      istTime.getFullYear(),
      istTime.getMonth(),
      istTime.getDate()
    ));

    if (s.includes('tomorrow')) {
      baseDate.setUTCDate(baseDate.getUTCDate() + 1);
    } else if (s.includes('day after')) {
      baseDate.setUTCDate(baseDate.getUTCDate() + 2);
    } else if (s.includes('today')) {
      // keep baseDate as today
    } else {
      // Try to find DD MMM / MMM DD / YYYY-MM-DD patterns
      const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        baseDate.setUTCFullYear(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      } else {
        const months: Record<string, number> = {
          jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
          january:0, february:1, march:2, april:3, june:5, july:6, august:7,
          september:8, october:9, november:10, december:11,
        };
        const monthKeys = Object.keys(months).sort((a,b) => b.length - a.length).join('|');
        const dayMonthMatch = raw.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthKeys})`, 'i'));
        const monDayMatch  = raw.match(new RegExp(`(${monthKeys})\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
        const matched = dayMonthMatch || monDayMatch;
        if (matched) {
          const [, a, b] = matched;
          const day = parseInt(dayMonthMatch ? a : b);
          const mon = months[(dayMonthMatch ? b : a).toLowerCase()];
          if (!isNaN(day) && mon !== undefined) {
            baseDate.setUTCFullYear(istTime.getFullYear(), mon, day);
            const todayStr = istTime.toISOString().slice(0, 10);
            if (baseDate.toISOString().slice(0, 10) < todayStr) {
              baseDate.setUTCFullYear(istTime.getFullYear() + 1);
            }
          }
        }
      }
    }
    bookingDate = baseDate.toISOString().slice(0, 10);

    // Time parsing
    const timeMatch = raw.match(/(\d{1,2})[:\.]?(\d{2})?\s*(am|pm)/i)
                   || raw.match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2] || '0');
      const meridiem = (timeMatch[3] || '').toLowerCase();
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      slotTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }
  } catch {
    // keep defaults
  }

  return { bookingDate, slotTime };
}
