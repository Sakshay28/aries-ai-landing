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
import { appendLeadRow } from '@/lib/integrations/google-sheets';
import { parseMetaWebhook, sendTextMessage, getMediaUrl, verifySignature } from '@/lib/meta/service';
import { processMessageWithAI } from '@/lib/ai/engine';
import { getTenantByPhoneNumberId, getTenantConfig } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { runFlowsForMessage } from '@/lib/flows/engine';
import { fireIntegrations } from '@/lib/integrations/runner';

// ── GET: Webhook Verification Handshake ──
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token) {
    // 1. Check global system verification token
    const systemVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
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
    console.log(`👍 Meta Webhook: reaction ignored (emoji: ${parsed.reactionEmoji}, to: ${parsed.reactedToMessageId})`);
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

  // 1. Deduplication
  const isDup = await isDuplicateMessage(msg.messageId);
  if (isDup) {
    console.log(`⚡ Meta Webhook: duplicate message skipped: ${msg.messageId}`);
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
    try {
      const { data: teamMembers } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: true });

      if (teamMembers && teamMembers.length > 0) {
        const counter = (tenant.lead_assignment_counter as number) ?? 0;
        const idx = counter % teamMembers.length;
        assignedTo = teamMembers[idx].id;
        void supabaseAdmin
          .from('tenants')
          .update({ lead_assignment_counter: counter + 1 })
          .eq('id', tenant.id);
      }
    } catch (e) {
      console.warn('⚠️ Assignment failed:', e);
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
        lead_score: isFromAd ? 30 : 10,
        created_at: new Date().toISOString(),
      }).catch(() => {});
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

  // 7. Verify message doesn't already exist in database
  if (msg.messageId) {
    const { data: existingMsg } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('wa_message_id', msg.messageId)
      .maybeSingle();
    if (existingMsg) {
      console.log(`⚠️ Duplicate inbound message ignored: ${msg.messageId}`);
      return;
    }
  }

  // 8. Insert Inbound Message
  const isMedia = ['image', 'video', 'audio', 'document', 'voice'].includes(msg.type);
  const { error: insertErr } = await supabaseAdmin.from('messages').insert({
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    direction: 'inbound',
    content,
    message_type: isMedia ? msg.type : 'text',
    channel: 'whatsapp',
    sender_id: cleanPhone,
    status: 'delivered',
    ai_generated: false,
    wa_message_id: msg.messageId,
    // Add attachment metadata fields for inbound media
    ...(isMedia && {
      media_url: content, // The resolved Meta media CDN URL
      file_name: msg.mediaFilename || `${msg.type}_${msg.messageId}.${msg.mediaMimeType?.split('/')?.[1]?.split(';')?.[0] || 'bin'}`,
      mime_type: msg.mediaMimeType || (msg.type === 'image' ? 'image/jpeg' : msg.type === 'video' ? 'video/mp4' : msg.type === 'audio' || msg.type === 'voice' ? 'audio/ogg' : 'application/octet-stream'),
      media_caption: msg.mediaCaption || null,
    }),
  });

  if (insertErr) {
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
  if (conversation.bot_paused || conversation.escalated) {
    console.log(`🔇 Meta: bot paused for conversation ${conversation.id}, skipping AI`);
    return;
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
    console.warn(`⚠️ Meta status update: No message matched wa_message_id="${msg.messageId}" in DB.`);
    return;
  }

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
