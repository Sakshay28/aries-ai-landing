import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantByIgPageId, getTenantConfig, incrementMessageCount, checkUsageLimits } from '@/lib/tenant/manager';
import { processMessageWithAI } from '@/lib/ai/engine';
import { sendInstagramMessage, markInstagramAsRead } from '@/lib/instagram/service';
import { sendStaffAlert } from '@/lib/whatsapp/service';
import { scheduleConversationTimeout } from '@/lib/followup/engine';
import { checkRedisRateLimit, getRedisClient } from '@/lib/redis/client';
import { v4 as uuidv4 } from 'uuid';
import { randomUUID } from 'crypto';
import { scheduleFollowUp } from '@/lib/followup/engine';
import type { Tenant, ConversationContext } from '@/lib/types';
import * as Sentry from '@sentry/nextjs';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function processIncomingIGMessage(igPageId: string, senderId: string, messageText: string, _messageId: string) {
  // ── Step 1: Find the tenant ──
  const tenant = await getTenantByIgPageId(igPageId);
  if (!tenant) {
    console.warn(`⚠️ No tenant found for ig_page_id: ${igPageId}`);
    return;
  }

  if (!tenant.is_active || tenant.plan_status === 'cancelled' || tenant.plan_status === 'suspended') {
    return;
  }

  // ── Trial expiry guard ──
  // plan_status defaults to 'active', so check subscription directly
  if (tenant.trial_ends_at && !tenant.razorpay_subscription_id) {
    const trialEnd = new Date(tenant.trial_ends_at).getTime();
    if (Date.now() > trialEnd) {
      console.warn(`⚠️ [${tenant.business_name}] IG: Trial expired, no active subscription`);
      return;
    }
  }

  // ── Rate limit per sender ──
  const rateCheck = await checkRedisRateLimit(`ig_sender:${senderId}`, 30, 60000);
  if (!rateCheck.allowed) return;

  // ── Check usage limits ──
  const usage = await checkUsageLimits(tenant);
  if (!usage.withinLimits) {
    try { await sendInstagramMessage(tenant, senderId, `Thank you for reaching out! Our team will get back to you shortly. 🙏`); } catch {}
    return;
  }

  console.log(`📥 [${tenant.business_name}] IG User (${senderId}): ${messageText}`);

  // ── Step 2: Mark as read ──
  await markInstagramAsRead(tenant, senderId);

  // ── Step 3: Increment usage counter ──
  await incrementMessageCount(tenant.id);

  // ── Step 4: Find or create conversation ──
  let conversation = await getActiveConversation(tenant.id, senderId, 'instagram_dm');
  
  if (!conversation) {
    conversation = await createNewConversation(tenant, senderId, messageText);
    return;
  }

  // ── Step 5: Handle Human Handoff (bot_paused) ──
  if (conversation.bot_paused) {
    await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'instagram_dm', senderId);
    console.log(`⏸️ [${tenant.business_name}] IG Bot paused. Ignored message from ${senderId}.`);
    return;
  }

  // ── Step 6: Load conversation history ──
  const history = await getConversationHistory(conversation.id);

  // ── Step 7: Acquire conversation mutex ──
  const redis = getRedisClient();
  const mutexKey = `conv:lock:${conversation.id}`;
  if (redis) {
    const acquired = await redis.set(mutexKey, '1', 'EX', 30, 'NX');
    if (!acquired) {
      console.warn(`⏳ [${tenant.business_name}] IG conversation ${conversation.id} locked, skipping parallel processing`);
      return;
    }
  }

  try {
  // ── Step 8: Process through AI engine ──
  const tenantConfig = getTenantConfig(tenant);
  const context: ConversationContext = conversation.context || {};

  const aiResponse = await processMessageWithAI(messageText, history, context, tenantConfig, tenant.id);

  // ── Step 9: Log & Send ──
  await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'instagram_dm', senderId);
  await sendInstagramMessage(tenant, senderId, aiResponse.reply);
  await logMessage(tenant.id, conversation.id, 'outbound', aiResponse.reply, 'instagram_dm', 'bot', true);

  // ── Step 10: Update state ──
  const updatedContext: ConversationContext = { ...context, ...aiResponse.extractedData };
  await updateConversation(conversation.id, aiResponse.nextStep, updatedContext);

  // ── Step 11: Timeouts, Escalations, Leads, Followups ──
  await scheduleConversationTimeout(conversation.id, tenant.id);

  if (aiResponse.shouldEscalate) {
    await handleEscalation(tenant, conversation.id, senderId, aiResponse);
  }

  if (aiResponse.nextStep === 'confirmation' || aiResponse.nextStep === 'completed') {
    try {
      await saveLead(tenant, conversation, updatedContext, senderId);
    } catch (err) {
      console.error(`⚠️ [${tenant.business_name}] IG saveLead failed (non-fatal):`, err);
      Sentry.captureException(err, { extra: { tenantId: tenant.id, context: 'ig_saveLead' } });
    }
    try {
      await scheduleFollowUps(tenant, conversation, updatedContext);
    } catch (err) {
      console.error(`⚠️ [${tenant.business_name}] IG scheduleFollowUps failed (non-fatal):`, err);
      Sentry.captureException(err, { extra: { tenantId: tenant.id, context: 'ig_scheduleFollowUps' } });
    }
  }
  } finally {
    if (redis) await redis.del(mutexKey).catch(() => {});
  }
}

// ═══════════════════════════════════════
// DB Helpers
// ═══════════════════════════════════════
async function getActiveConversation(tenantId: string, senderId: string, channel: string) {
  const { data } = await supabaseAdmin.from('conversations')
    .select('*').eq('tenant_id', tenantId).eq('sender_id', senderId)
    .eq('channel', channel).eq('is_active', true)
    .order('created_at', { ascending: false }).limit(1).single();
  if (data && typeof data.context === 'string') data.context = JSON.parse(data.context);
  return data;
}

async function createNewConversation(tenant: Tenant, senderId: string, firstMessage: string) {
  const leadId = uuidv4();
  const convId = uuidv4();
  const senderName = `IG User ${senderId.slice(-4)}`;

  await supabaseAdmin.from('leads').insert({
    id: leadId, tenant_id: tenant.id, name: senderName,
    channel: 'instagram_dm', lead_status: 'new',
  });

  const context: ConversationContext = { name: senderName };
  await supabaseAdmin.from('conversations').insert({
    id: convId, tenant_id: tenant.id, lead_id: leadId,
    channel: 'instagram_dm', sender_id: senderId,
    sender_name: senderName, current_step: 'greeting', context,
  });

  await logMessage(tenant.id, convId, 'inbound', firstMessage, 'instagram_dm', senderId);

  const tenantConfig = getTenantConfig(tenant);
  const greeting = `Hey there 👋 Welcome to ${tenantConfig.businessName}!\n\nI'm ${tenantConfig.botName}, your personal assistant.\n\nHow can I help you today?`;
  
  await sendInstagramMessage(tenant, senderId, greeting);
  await logMessage(tenant.id, convId, 'outbound', greeting, 'instagram_dm', 'bot');

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id, event_type: 'new_lead',
    channel: 'instagram_dm', metadata: { source: senderId },
  });

  // Increment the monthly AI conversation counter
  await supabaseAdmin.rpc('increment_ai_conversations', { p_tenant_id: tenant.id });

  await scheduleConversationTimeout(convId, tenant.id);
  const { data } = await supabaseAdmin.from('conversations').select('*').eq('id', convId).single();
  return data;
}

async function getConversationHistory(conversationId: string) {
  const { data } = await supabaseAdmin.from('messages').select('direction, content')
    .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(40);
  return (data || []).map((m) => ({ role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const, content: m.content }));
}

async function logMessage(tenantId: string, conversationId: string, direction: 'inbound'|'outbound', content: string, channel: string, senderId: string, aiGenerated = false) {
  await supabaseAdmin.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, direction, content, channel, sender_id: senderId, ai_generated: aiGenerated });
  await supabaseAdmin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
}

async function updateConversation(conversationId: string, nextStep: string, context: ConversationContext) {
  await supabaseAdmin.from('conversations').update({ current_step: nextStep, context, last_message_at: new Date().toISOString() }).eq('id', conversationId);
}

async function handleEscalation(
  tenant: Tenant,
  conversationId: string,
  senderId: string,
  aiResponse: Awaited<ReturnType<typeof processMessageWithAI>>,
) {
  await supabaseAdmin.from('conversations').update({ escalated: true, escalated_at: new Date().toISOString(), escalation_reason: aiResponse.escalationReason }).eq('id', conversationId);
  await sendStaffAlert(tenant, `🔔 IG ESCALATION\n\n👤 IG User (${senderId})\n⚠️ Reason: ${aiResponse.escalationReason}\n🏢 ${tenant.business_name}`);
}

async function saveLead(tenant: Tenant, conversation: Record<string, unknown>, context: ConversationContext, senderId: string) {
  void tenant; // used for future analytics enrichment
  void senderId;
  await supabaseAdmin.from('leads').update({
    name: context.name, phone: context.phone, email: context.email,
    enquiry_type: context.enquiry_type, guest_count: context.guest_count,
    date_requested: context.date_requested, occasion: context.occasion,
    lead_status: 'warm', last_message_at: new Date().toISOString(),
  }).eq('id', conversation.lead_id);
}

async function scheduleFollowUps(tenant: Tenant, conversation: Record<string, unknown>, context: ConversationContext) {
  const now = Date.now();
  const leadId = conversation.lead_id as string;
  const convId = conversation.id as string;
  const leadPhone = (context.instagram_id || conversation.sender_id) as string;
  const leadName = context.name || 'Customer';

  type FollowUpEntry = {
    id: string;
    tenant_id: string;
    lead_id: string;
    conversation_id: string;
    follow_up_type: string;
    scheduled_at: string;
    message: null;
    ai_generated: boolean;
    delayMs: number;
  };

  const followUpsToCreate: FollowUpEntry[] = [];

  if (tenant.followup_30min) {
    const delayMs = 30 * 60 * 1000;
    const id = randomUUID();
    followUpsToCreate.push({ id, tenant_id: tenant.id, lead_id: leadId, conversation_id: convId, follow_up_type: '30min', scheduled_at: new Date(now + delayMs).toISOString(), message: null, ai_generated: true, delayMs });
  }
  if (tenant.followup_24hr) {
    const delayMs = 24 * 60 * 60 * 1000;
    const id = randomUUID();
    followUpsToCreate.push({ id, tenant_id: tenant.id, lead_id: leadId, conversation_id: convId, follow_up_type: '24hr', scheduled_at: new Date(now + delayMs).toISOString(), message: null, ai_generated: true, delayMs });
  }

  if (followUpsToCreate.length === 0) return;

  await supabaseAdmin.from('follow_ups').insert(followUpsToCreate.map(({ delayMs: _, ...f }) => f));
  for (const fu of followUpsToCreate) {
    await scheduleFollowUp({ followUpId: fu.id, tenantId: tenant.id, leadId, conversationId: convId, followUpType: fu.follow_up_type, message: null, leadPhone, leadName, delayMs: fu.delayMs });
  }
}
