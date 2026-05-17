// ═══════════════════════════════════════════════════════════
// 📥 Gupshup Webhook Handler
// ═══════════════════════════════════════════════════════════
// Gupshup POSTs incoming messages and delivery status events
// to this endpoint. Must return 200 in < 5 seconds.
// All heavy lifting (AI, DB writes, sending) is async.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isDuplicateMessage } from '@/lib/redis/client';
import { parseGupshupWebhook, sendTextMessage } from '@/lib/gupshup/service';
import { processMessageWithAI } from '@/lib/ai/engine';
import { getTenantConfig } from '@/lib/tenant/manager';

// ── Return 200 immediately — Gupshup requires < 5s response ──
export async function POST(req: NextRequest) {
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

  // Return 200 immediately — process asynchronously
  // Using void to fire-and-forget without awaiting
  void processWebhookAsync(parsed).catch(err => {
    console.error('❌ Gupshup webhook processing error:', err);
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

  if (existingLead) {
    lead = existingLead;
    // Update last_message_at
    await supabaseAdmin
      .from('leads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', existingLead.id);
  } else {
    // Create new lead
    const { data: newLead } = await supabaseAdmin
      .from('leads')
      .insert({
        tenant_id: tenant.id,
        phone: cleanPhone,
        channel: 'whatsapp',
        lead_status: 'new',
        lead_score: 10,
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();
    lead = newLead;
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

  // ── Insert inbound message ──
  await supabaseAdmin.from('messages').insert({
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

  // ── Update conversation message count ──
  try {
    await supabaseAdmin.rpc('increment_message_count_conv', { conv_id: conversation.id });
  } catch {
    // Non-critical — proceed without incrementing
  }


  // ── Skip AI if bot is paused or conversation is escalated ──
  if (conversation.bot_paused || conversation.escalated) {
    console.log(`🔇 Gupshup: bot paused for conversation ${conversation.id}, skipping AI`);
    return;
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
  const tenantConfig = getTenantConfig(tenant as Parameters<typeof getTenantConfig>[0]);
  const context = (conversation.context as Record<string, unknown>) || {};

  let aiResponse: Awaited<ReturnType<typeof processMessageWithAI>>;
  try {
    aiResponse = await processMessageWithAI(
      msg.text,
      history,
      context,
      tenantConfig,
      tenant.id
    );
  } catch (err) {
    console.error('❌ Gupshup: AI engine error:', err);
    return;
  }

  if (!aiResponse?.reply) return;

  // ── Send AI reply via Gupshup ──
  let gupshupMsgId: string | null = null;
  try {
    const result = await sendTextMessage(
      tenant.gupshup_api_key as string,
      tenant.gupshup_phone_number as string,
      cleanPhone,
      aiResponse.reply
    );
    gupshupMsgId = result.messageId;
  } catch (sendErr) {
    console.error('❌ Gupshup: failed to send AI reply:', (sendErr as Error).message);
    // Still insert the message as failed
  }

  // ── Insert AI outbound message ──
  await supabaseAdmin.from('messages').insert({
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
  if (!msg.messageId || !msg.status) return;

  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  };

  const mappedStatus = statusMap[msg.status] || msg.status;

  await supabaseAdmin
    .from('messages')
    .update({ status: mappedStatus })
    .eq('wa_message_id', msg.messageId);

  console.log(`📬 Gupshup status: ${msg.messageId} → ${mappedStatus}`);
}
