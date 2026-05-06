import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantByPhoneNumberId, getTenantConfig, incrementMessageCount, checkUsageLimits } from '@/lib/tenant/manager';
import { processMessageWithAI } from '@/lib/ai/engine';
import { sendTextMessage, markAsRead, sendStaffAlert, isWhatsAppConfigured, type ParsedWhatsAppMessage } from '@/lib/whatsapp/service';
import { scheduleFollowUp, scheduleConversationTimeout } from '@/lib/followup/engine';
import { checkRedisRateLimit, getRedisClient } from '@/lib/redis/client';
import { v4 as uuidv4 } from 'uuid';
import type { Tenant, ConversationContext } from '@/lib/types';
import * as Sentry from '@sentry/nextjs';

// ═══════════════════════════════════════
// Off-Hours Check
// ═══════════════════════════════════════
function isWithinWorkingHours(tenant: Tenant): { isOpen: boolean; openTime: string; closeTime: string } {
  const workingHours = tenant.working_hours;
  if (!workingHours || Object.keys(workingHours).length === 0) {
    return { isOpen: true, openTime: '09:00', closeTime: '22:00' };
  }

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const currentTime = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata', // IST for Indian businesses
  });

  const dayMap: Record<number, string[]> = {
    0: ['sun', 'sat-sun', 'weekend'],
    1: ['mon', 'mon-fri', 'weekday'],
    2: ['tue', 'mon-fri', 'weekday'],
    3: ['wed', 'mon-fri', 'weekday'],
    4: ['thu', 'mon-fri', 'weekday'],
    5: ['fri', 'mon-fri', 'weekday'],
    6: ['sat', 'sat-sun', 'weekend'],
  };

  const possibleKeys = dayMap[dayOfWeek] || [];
  let todayHours = '';

  for (const key of possibleKeys) {
    if (workingHours[key]) {
      todayHours = workingHours[key];
      break;
    }
  }

  if (!todayHours) {
    const firstKey = Object.keys(workingHours)[0];
    todayHours = workingHours[firstKey] || '09:00-22:00';
  }

  const [openTime, closeTime] = todayHours.split('-').map((t) => t.trim());

  if (!openTime || !closeTime) {
    return { isOpen: true, openTime: '09:00', closeTime: '22:00' };
  }

  const isOpen = currentTime >= openTime && currentTime <= closeTime;
  return { isOpen, openTime, closeTime };
}

function getOffHoursMessage(tenant: Tenant, senderName: string, openTime: string): string {
  const name = (senderName || 'there').split(' ')[0];
  const welcomeMessage = tenant.welcome_message;

  if (welcomeMessage && welcomeMessage.includes('{off_hours}')) {
    return welcomeMessage
      .replace('{off_hours}', '')
      .replace('{customer_name}', name)
      .replace('{business_name}', tenant.business_name)
      .replace('{open_time}', openTime);
  }

  return `Hi ${name}! 🌙 Thanks for reaching out to ${tenant.business_name}.\n\nWe're currently closed (open from ${openTime}). I've noted your enquiry and our team will get back to you first thing when we open.\n\nIn the meantime, can I get your name and what you're looking for? We'll make sure to prioritize your request! 🙏`;
}

// ═══════════════════════════════════════
// Core Message Processor
// ═══════════════════════════════════════
export async function processIncomingMessage(msg: ParsedWhatsAppMessage) {
  const senderId = msg.from;
  const senderName = msg.profileName;
  const messageText = msg.text;
  const messageId = msg.messageId;
  const phoneNumberId = msg.phoneNumberId;

  // ── Step 1: Find the tenant ──
  const tenant = await getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    console.warn(`⚠️ No tenant found for phone_number_id: ${phoneNumberId}`);
    return;
  }

  if (!tenant.is_active || tenant.plan_status === 'cancelled' || tenant.plan_status === 'suspended') {
    console.warn(`⚠️ [${tenant.business_name}] Tenant inactive or plan suspended, skipping`);
    return;
  }

  // ── Trial expiry guard ──
  // Block if trial has ended AND tenant has no paid subscription.
  // NOTE: plan_status defaults to 'active' for new tenants, so we cannot
  // rely on plan_status here — we must check razorpay_subscription_id directly.
  if (tenant.trial_ends_at && !tenant.razorpay_subscription_id) {
    const trialEnd = new Date(tenant.trial_ends_at).getTime();
    if (Date.now() > trialEnd) {
      console.warn(`⚠️ [${tenant.business_name}] Trial expired, no active subscription`);
      try {
        await sendTextMessage(tenant, senderId, `Thanks for reaching out! Our system is currently being upgraded. Please contact the business directly. 🙏`);
      } catch { /* ignore */ }
      return;
    }
  }

  // ── Rate limit per sender ──
  const rateCheck = await checkRedisRateLimit(`sender:${senderId}`, 30, 60000);
  if (!rateCheck.allowed) {
    console.warn(`⚠️ Rate limit hit for sender ${senderId}`);
    return;
  }

  // ── Check usage limits ──
  const usage = await checkUsageLimits(tenant);
  if (!usage.withinLimits) {
    console.warn(`⚠️ [${tenant.business_name}] Message limit exceeded`);
    try {
      await sendTextMessage(tenant, senderId, `Thank you for reaching out! Our team will get back to you shortly. 🙏`);
    } catch { /* ignore */ }
    return;
  }

  console.log(`📥 [${tenant.business_name}] ${senderName} (${senderId}): ${messageText}`);

  // ── Step 2: Mark as read ──
  await markAsRead(tenant, messageId);

  // ── Step 3: Increment usage counter ──
  await incrementMessageCount(tenant.id);

  // ── Step 4: Find or create conversation ──
  let conversation = await getActiveConversation(tenant.id, senderId, 'whatsapp');

  if (conversation) {
    // ── Fix: Conversation Context Timeout ──
    const hoursSinceLastMessage = (Date.now() - new Date(conversation.last_message_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastMessage > 24) {
      console.log(`⏰ [${tenant.business_name}] Conversation ${conversation.id} timed out. Resetting context.`);
      await updateConversation(conversation.id, 'timed_out', conversation.context || {});
      await supabaseAdmin.from('conversations').update({ is_active: false }).eq('id', conversation.id);
      
      conversation = await createNewConversation(tenant, senderId, senderName, messageText, messageId);
      return;
    }
  } else {
    conversation = await createNewConversation(tenant, senderId, senderName, messageText, messageId);
    return;
  }

  // ── Step 5: Check off-hours ──
  const { isOpen, openTime } = isWithinWorkingHours(tenant);
  if (!isOpen) {
    const offHoursReply = getOffHoursMessage(tenant, senderName, openTime);
    await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'whatsapp', senderId, false, messageId);
    await sendTextMessage(tenant, senderId, offHoursReply);
    await logMessage(tenant.id, conversation.id, 'outbound', offHoursReply, 'whatsapp', 'bot', true);
    await updateConversation(conversation.id, conversation.current_step, conversation.context || {});
    console.log(`🌙 [${tenant.business_name}] Off-hours response sent to ${senderName}`);
    return;
  }

  // ── Step 6: Handle Human Handoff ──
  if (conversation.bot_paused) {
    await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'whatsapp', senderId, false, messageId);
    console.log(`⏸️ [${tenant.business_name}] Bot is paused. Ignored message from ${senderName}.`);
    return;
  }

  // ── Step 7: Load conversation history ──
  const history = await getConversationHistory(conversation.id);

  // ── Step 8: Acquire conversation mutex (prevents parallel AI calls corrupting context) ──
  // BullMQ workers run at concurrency: 10. Two messages from the same sender arriving
  // within milliseconds could both read the same context and both call updateConversation.
  // Last-write-wins would corrupt the conversation state. The mutex ensures serial processing.
  const redis = getRedisClient();
  const mutexKey = `conv:lock:${conversation.id}`;
  if (redis) {
    const acquired = await redis.set(mutexKey, '1', 'EX', 30, 'NX');
    if (!acquired) {
      // Another worker is processing this conversation — send a graceful wait message
      console.warn(`⏳ [${tenant.business_name}] Conversation ${conversation.id} locked, skipping parallel processing for ${senderId}`);
      try {
        await sendTextMessage(tenant, senderId, `I'm still processing your previous message. Please wait a moment and try again! 🙏`);
      } catch { /* ignore */ }
      return;
    }
  }

  try {
  // ── Step 9: Process through AI engine ──
  const tenantConfig = getTenantConfig(tenant);
  const context: ConversationContext = conversation.context || {};

  const aiResponse = await processMessageWithAI(
    messageText,
    history,
    context,
    tenantConfig,
    tenant.id
  );

  // ── Step 10: Log inbound message ──
  await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'whatsapp', senderId, false, messageId);

  // ── Step 11: Send reply ──
  let sendError: Error | null = null;
  try {
    await sendTextMessage(tenant, senderId, aiResponse.reply);
  } catch (err) {
    sendError = err as Error;
  }
  
  await logMessage(tenant.id, conversation.id, 'outbound', sendError ? `[FAILED TO SEND] ${aiResponse.reply}` : aiResponse.reply, 'whatsapp', 'bot', true);
  if (sendError) throw sendError;

  // ── Step 12: Update conversation state ──
  const updatedContext: ConversationContext = { ...context, ...aiResponse.extractedData };
  await updateConversation(conversation.id, aiResponse.nextStep, updatedContext);

  // ── Step 13: Schedule conversation timeout ──
  await scheduleConversationTimeout(conversation.id, tenant.id);

  // ── Step 14: Handle escalation ──
  if (aiResponse.shouldEscalate) {
    await handleEscalation(tenant, conversation.id, senderId, senderName, aiResponse, updatedContext);
  }

  // ── Step 15: Save lead when enough data ──
  if (aiResponse.nextStep === 'confirmation' || aiResponse.nextStep === 'completed') {
    try {
      await saveLead(tenant, conversation, updatedContext, senderId);
    } catch (err) {
      console.error(`⚠️ [${tenant.business_name}] saveLead failed (non-fatal):`, err);
      Sentry.captureException(err, { extra: { tenantId: tenant.id, context: 'saveLead' } });
    }
  }

  // ── Step 16: Schedule follow-ups via BullMQ ──
  if (aiResponse.nextStep === 'confirmation') {
    try {
      await scheduleFollowUps(tenant, conversation, updatedContext);
    } catch (err) {
      console.error(`⚠️ [${tenant.business_name}] scheduleFollowUps failed (non-fatal):`, err);
      Sentry.captureException(err, { extra: { tenantId: tenant.id, context: 'scheduleFollowUps' } });
    }
  }
  } finally {
    // Always release mutex, even if processing throws
    if (redis) await redis.del(mutexKey).catch(() => {});
  }
}

// ═══════════════════════════════════════
// Database Helpers
// ═══════════════════════════════════════

async function getActiveConversation(tenantId: string, senderId: string, channel: string) {
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('sender_id', senderId)
    .eq('channel', channel)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (data) {
    data.context = typeof data.context === 'string' ? JSON.parse(data.context) : data.context;
  }
  return data;
}

async function createNewConversation(
  tenant: Tenant,
  senderId: string,
  senderName: string,
  firstMessage: string,
  messageId?: string
) {
  const leadId = uuidv4();
  const convId = uuidv4();

  await supabaseAdmin.from('leads').insert({
    id: leadId,
    tenant_id: tenant.id,
    name: senderName,
    phone: senderId,
    channel: 'whatsapp',
    lead_status: 'new',
  });

  const context: ConversationContext = { name: senderName };
  await supabaseAdmin.from('conversations').insert({
    id: convId,
    tenant_id: tenant.id,
    lead_id: leadId,
    channel: 'whatsapp',
    sender_id: senderId,
    sender_name: senderName,
    current_step: 'greeting',
    context,
  });

  await logMessage(tenant.id, convId, 'inbound', firstMessage, 'whatsapp', senderId, false, messageId);

  const { isOpen, openTime } = isWithinWorkingHours(tenant);

  let greeting: string;
  if (!isOpen) {
    greeting = getOffHoursMessage(tenant, senderName, openTime);
  } else {
    const tenantConfig = getTenantConfig(tenant);
    greeting = `Hey ${(senderName || 'there').split(' ')[0]} 👋 Welcome to ${tenantConfig.businessName}!\n\nI'm ${tenantConfig.botName}, your automated AI assistant.\n\nHow can I help you today?\n\n🍽️ Reserve a Table\n🎉 Plan an Event\n💼 Corporate Booking\n📋 General Enquiry`;
  }

  if (isWhatsAppConfigured(tenant)) {
    await sendTextMessage(tenant, senderId, greeting);
  }

  await logMessage(tenant.id, convId, 'outbound', greeting, 'whatsapp', 'bot');

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: 'new_lead',
    channel: 'whatsapp',
    metadata: { name: senderName, phone: senderId },
  });

  // Increment the monthly AI conversation counter
  await supabaseAdmin.rpc('increment_ai_conversations', { p_tenant_id: tenant.id });

  await scheduleConversationTimeout(convId, tenant.id);

  console.log(`✨ [${tenant.business_name}] New lead: ${senderName} (${senderId})`);

  const { data } = await supabaseAdmin.from('conversations').select('*').eq('id', convId).single();
  return data;
}

async function getConversationHistory(conversationId: string) {
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('direction, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(40);

  return (messages || []).map((m) => ({
    role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: m.content,
  }));
}

async function logMessage(
  tenantId: string,
  conversationId: string,
  direction: 'inbound' | 'outbound',
  content: string,
  channel: string,
  senderId: string,
  aiGenerated = false,
  waMessageId?: string
) {
  await supabaseAdmin.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction,
    content,
    channel,
    sender_id: senderId,
    ai_generated: aiGenerated,
    wa_message_id: waMessageId || null,
  });

  await supabaseAdmin
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

async function updateConversation(conversationId: string, nextStep: string, context: ConversationContext) {
  await supabaseAdmin
    .from('conversations')
    .update({
      current_step: nextStep,
      context,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

async function handleEscalation(
  tenant: Tenant,
  conversationId: string,
  senderId: string,
  senderName: string,
  aiResponse: Awaited<ReturnType<typeof processMessageWithAI>>,
  context: ConversationContext
) {
  await supabaseAdmin
    .from('conversations')
    .update({
      escalated: true,
      escalated_at: new Date().toISOString(),
      escalation_reason: aiResponse.escalationReason,
    })
    .eq('id', conversationId);

  const alertMsg = `🔔 ESCALATION\n\n👤 ${senderName} (${senderId})\n📲 Channel: WhatsApp\n⚠️ Reason: ${aiResponse.escalationReason}\n🏢 ${tenant.business_name}\n\nContext: ${context.enquiry_type || 'General'}`;
  await sendStaffAlert(tenant, alertMsg);

  console.log(`⚠️ [${tenant.business_name}] Escalated: ${senderName} — ${aiResponse.escalationReason}`);
}

async function saveLead(
  tenant: Tenant,
  conversation: Record<string, unknown>,
  context: ConversationContext,
  senderId: string
) {
  await supabaseAdmin
    .from('leads')
    .update({
      name: context.name,
      phone: context.phone || senderId,
      email: context.email,
      enquiry_type: context.enquiry_type,
      guest_count: context.guest_count,
      date_requested: context.date_requested,
      occasion: context.occasion,
      lead_status: 'warm',
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversation.lead_id);

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: 'lead_captured',
    channel: 'whatsapp',
    metadata: context,
  });

  console.log(`💾 [${tenant.business_name}] Lead saved: ${context.name}`);
}

async function scheduleFollowUps(
  tenant: Tenant,
  conversation: Record<string, unknown>,
  context: ConversationContext
) {
  const now = Date.now();
  // tenantConfig reserved for future AI-generated follow-up messages
  const leadId = conversation.lead_id as string;
  const convId = conversation.id as string;
  const leadPhone = (context.phone || conversation.sender_id) as string;
  const leadName = context.name || 'Customer';

  const followUps: Array<{
    id: string;
    tenant_id: string;
    lead_id: string;
    conversation_id: string;
    follow_up_type: string;
    scheduled_at: string;
    message: string | null;
    ai_generated: boolean;
    delayMs: number;
  }> = [];

  if (tenant.followup_30min) {
    const delayMs = 30 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '30min',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (tenant.followup_3hr) {
    const delayMs = 3 * 60 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '3hr',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (tenant.followup_24hr) {
    const delayMs = 24 * 60 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '24hr',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (tenant.followup_7day) {
    const delayMs = 7 * 24 * 60 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '7day',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (followUps.length > 0) {
    await supabaseAdmin.from('follow_ups').insert(
      followUps.map(({ delayMs, ...f }) => f) // eslint-disable-line @typescript-eslint/no-unused-vars
    );

    for (const fu of followUps) {
      await scheduleFollowUp({
        followUpId: fu.id,
        tenantId: tenant.id,
        leadId: leadId,
        conversationId: convId,
        followUpType: fu.follow_up_type,
        message: fu.message,
        leadPhone,
        leadName,
        delayMs: fu.delayMs,
      });
    }

    console.log(`⏰ [${tenant.business_name}] ${followUps.length} follow-ups scheduled (BullMQ)`);
  }
}
