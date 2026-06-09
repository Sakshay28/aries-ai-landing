// ═══════════════════════════════════════════════════════════
// 📥 Meta WhatsApp Webhook Handler (Multi-Tenant)
// ═══════════════════════════════════════════════════════════
// Handles Meta's webhook verification handshake (GET) and
// processes incoming messages and status updates (POST).
// Uses after() to keep responses under Meta's 5s timeout.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isDuplicateMessage, getRedisClient, acquireOffHoursLock } from '@/lib/redis/client';
import { createPaymentLink } from '@/lib/payments/razorpay-links';
import { retrieveRelevantDocs } from '@/lib/ai/rag';
import { appendLeadRow, appendBookingRow } from '@/lib/integrations/google-sheets';
import { parseMetaWebhook, sendTextMessage, getMediaUrl, verifySignature, markMessageAsRead, sendTypingIndicator } from '@/lib/meta/service';
import { isSafeWebhookUrl } from '@/lib/utils/ssrf';
import { processMessageWithAI } from '@/lib/ai/engine';
import { getTenantByPhoneNumberId, getTenantConfig } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { runFlowsForMessage } from '@/lib/flows/engine';
import { fireIntegrations, createBookingPaymentLink } from '@/lib/integrations/runner';
import { sendLeadAssignedEmail } from '@/lib/email/service';
import { scheduleFollowUp } from '@/lib/followup/engine';
import { randomUUID } from 'crypto';
import { triggerCapiEvent } from '@/lib/integrations/capi-trigger';
import { processCtwaLead, getCampaignContextForAI } from '@/lib/meta-ads/attribution';
import { notifyAdmin } from '@/lib/alerts/admin';
import * as Sentry from '@/lib/sentry-stub';

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
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const rawBody = await req.text();

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.error('❌ Meta Webhook: failed to parse JSON body:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to prevent retries
  }

  // ── Per-tenant app secret verification ──────────────────────────────────────
  // Each client has their own Meta Developer App with a different App Secret.
  // We identify the tenant by phone_number_id FIRST, then verify with their secret.
  // Falls back to the global META_APP_SECRET env var for backward compatibility.
  const phoneNumberId =
    body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id as string | undefined;

  let appSecretToUse = process.env.META_APP_SECRET ?? '';

  if (phoneNumberId) {
    const redis = getRedisClient();
    const secretCacheKey = `app_secret:${phoneNumberId}`;
    let cachedSecret: string | null = null;

    if (redis) {
      try { cachedSecret = await redis.get(secretCacheKey); } catch {}
    }

    if (cachedSecret) {
      appSecretToUse = cachedSecret;
    } else {
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('wa_app_secret')
        .eq('wa_phone_number_id', phoneNumberId)
        .maybeSingle();

      if (tenantRow?.wa_app_secret) {
        try {
          const decrypted = decryptToken(tenantRow.wa_app_secret as string);
          if (decrypted) {
            appSecretToUse = decrypted;
            if (redis) redis.set(secretCacheKey, decrypted, 'EX', 300).catch(() => {});
          }
        } catch {
          // Fall through to global secret
        }
      }
    }
  }

  // Signature verification: verify when we have a secret, warn-and-continue when we don't.
  // Previously this hard-rejected when META_APP_SECRET was missing, which silently
  // killed ALL replies whenever the env var wasn't set.
  if (appSecretToUse) {
    // A secret is configured → require a signature that is BOTH present AND valid.
    // The previous `signature && !verify` form let an attacker bypass verification
    // entirely just by omitting the x-hub-signature-256 header (signature falsy →
    // condition short-circuits to false → request accepted unsigned).
    if (!signature || !verifySignature(rawBody, signature, appSecretToUse)) {
      console.warn('❌ Meta Webhook: missing or invalid signature for phone_number_id:', phoneNumberId);
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    // No secret configured — log once and continue processing.
    // This is less secure but keeps the bot functional.
    console.warn('⚠️ META_APP_SECRET not set and no per-tenant wa_app_secret found — skipping signature verification. Set META_APP_SECRET in Vercel env vars for security.');
  }

  // Parse Meta Payload
  const parsed = parseMetaWebhook(body);
  if (!parsed) {
    return NextResponse.json({ ok: true });
  }

  // Replay-attack guard: reject messages with a timestamp more than 5 minutes old.
  // Meta's webhooks include a Unix timestamp on every message. Even if the dedup
  // Redis key has expired, a replayed signed message from days/months ago is rejected
  // here before any DB writes or AI invocations are triggered.
  // Status updates don't carry a user-level timestamp — skip the check for those.
  if (!parsed.isStatusUpdate && parsed.timestamp) {
    const ageMs = Math.abs(Date.now() - parsed.timestamp);
    if (ageMs > 5 * 60 * 1000) {
      console.warn(`⏱️ Meta Webhook: stale message rejected (age=${Math.round(ageMs / 1000)}s), phone_number_id=${parsed.appPhoneId}`);
      return NextResponse.json({ ok: true }); // return 200 so Meta doesn't retry
    }
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

  const _t0 = Date.now();
  const perf = (label: string) => console.log(`[PERF] ${label}: +${Date.now() - _t0}ms`);

  // 1. Dedup + Tenant lookup in PARALLEL — saves ~50-100ms vs sequential
  const [isDup, tenant] = await Promise.all([
    isDuplicateMessage(msg.messageId),
    getTenantByPhoneNumberId(msg.appPhoneId),
  ]);
  perf('dedup+tenant');

  if (isDup) {
    console.log(`⚡ Meta Webhook: duplicate message skipped early: ${msg.messageId}`);
    return;
  }
  if (!tenant) {
    console.error(`❌ Meta Webhook: no tenant found with wa_phone_number_id="${msg.appPhoneId}"`);
    return;
  }

  console.log(`✅ Meta Webhook: tenant resolved: ${tenant.business_name} (${tenant.id})`);

  // Decrypt token ONCE — reused for read receipt, media, AI reply, off-hours, booking
  const decryptedAccessToken = decryptToken(tenant.wa_access_token);

  // 2b. Mark message as read immediately (triggers blue ticks on sender's phone)
  if (decryptedAccessToken && tenant.wa_phone_number_id) {
    markMessageAsRead(decryptedAccessToken, tenant.wa_phone_number_id, msg.messageId).catch(() => {});
  }

  // 3. Resolve Media URL if this is a media message
  let content = msg.text;
  if (msg.mediaId) {
    if (decryptedAccessToken) {
      const mediaUrl = await getMediaUrl(decryptedAccessToken, msg.mediaId);
      if (mediaUrl) {
        content = mediaUrl;
        console.log(`📸 Resolved Meta media ID "${msg.mediaId}" to URL: ${mediaUrl.slice(0, 100)}...`);
      }
    }
  }

  // 4. Resolve/Create Lead — ATOMIC upsert prevents duplicate-lead race condition.
  // The UNIQUE(tenant_id, phone) DB constraint + ON CONFLICT ensures only one row
  // per phone number per tenant, even with 3 concurrent webhook deliveries.
  const cleanPhone = msg.fromPhone.replace(/\D/g, '');
  let lead: Record<string, any> | null = null;

  const isFromAd = !!msg.referral && msg.referral.source_type === 'ad';
  const leadSource = isFromAd ? 'meta_ctwa' : 'whatsapp';

  // Fetch lead + conversation in parallel (independent queries)
  const [{ data: existingLead }, { data: existingConv }] = await Promise.all([
    supabaseAdmin.from('leads').select('*').eq('tenant_id', tenant.id).eq('phone', cleanPhone).maybeSingle(),
    supabaseAdmin.from('conversations').select('*').eq('tenant_id', tenant.id).eq('sender_id', cleanPhone).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Session expiry: if the last message in an active conversation was >24h ago, close it
  // and start fresh. This allows the welcome message to trigger again for returning customers
  // and prevents stale booking context from polluting new sessions.
  const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
  let sessionExpired = false;
  if (existingConv?.last_message_at) {
    const idleMs = Date.now() - new Date(existingConv.last_message_at as string).getTime();
    if (idleMs > SESSION_EXPIRY_MS) {
      sessionExpired = true;
      void supabaseAdmin.from('conversations').update({ is_active: false }).eq('id', existingConv.id);
      console.log(`⏰ Session expired for ${cleanPhone} (idle ${Math.round(idleMs / 3600000)}h) — starting fresh session`);
    }
  }
  // activeExistingConv is null when no session exists OR when the previous session expired.
  // isFirstMessage and conversation creation both derive from this.
  const activeExistingConv = sessionExpired ? null : existingConv;

  if (existingLead) {
    lead = existingLead;
    const updateData: Record<string, any> = { last_message_at: new Date().toISOString() };
    if (isFromAd && !existingLead.source) updateData.source = leadSource;
    void supabaseAdmin.from('leads').update(updateData).eq('id', existingLead.id);
  } else {
    // New lead — round-robin assignment + campaign tracking in parallel (~100ms savings)
    let assignedTo: string | null = null;
    let assignedMember: { id: string; email?: string; full_name?: string } | null = null;
    let campaignId: string | null = null;
    let campaignName: string | undefined;

    const [teamMembersResult, campaignsResult] = await Promise.all([
      (async () => {
        try {
          return await supabaseAdmin
            .from('users')
            .select('id, is_sales_agent, email, full_name')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: true });
        } catch (e) {
          console.warn('⚠️ Assignment query failed:', e);
          return { data: null };
        }
      })(),
      (async () => {
        try {
          return await supabaseAdmin
            .from('lead_campaigns')
            .select('id, name, ref_code, meta_ad_id')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true);
        } catch {
          return { data: null }; // lead_campaigns may not exist yet — safe to skip
        }
      })(),
    ]);

    // Process team assignment
    try {
      const teamMembers = teamMembersResult.data as Array<{ id: string; is_sales_agent?: boolean; email?: string; full_name?: string }> | null;
      if (teamMembers && teamMembers.length > 0) {
        const salesPool = teamMembers.filter((m) => m.is_sales_agent);
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

    // Process campaign tracking
    try {
      const campaigns = campaignsResult.data as Array<{ id: string; name: string; ref_code?: string; meta_ad_id?: string }> | null;
      const text = (msg.text || '').toLowerCase();
      let hit: { id: string; name: string } | undefined;
      if (text && campaigns) {
        hit = campaigns.find((c) => {
          if (!c.ref_code) return false;
          const esc = c.ref_code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`\\b${esc}\\b`).test(text);
        });
      }
      const adId = isFromAd ? msg.referral?.source_id : undefined;
      if (!hit && adId && campaigns) {
        hit = campaigns.find((c) => !!c.meta_ad_id && c.meta_ad_id === adId);
      }
      if (hit) { campaignId = hit.id; campaignName = hit.name; }
    } catch {
      // skip silently
    }

    // INSERT with ON CONFLICT DO NOTHING so a concurrent race still resolves safely
    const { data: newLead } = await supabaseAdmin
      .from('leads')
      .upsert(
        {
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
            notes: `Meta Ad — "${msg.referral.headline || ''}" | Ad ID: ${msg.referral.source_id || ''}`,
            ...(msg.referral.ctwa_clid && { ctwa_clid: msg.referral.ctwa_clid }),
          }),
        },
        { onConflict: 'tenant_id,phone', ignoreDuplicates: true }
      )
      .select()
      .single();

    lead = newLead;

    if (newLead) {
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
      }).catch(e => console.error('⚠️ Sheets append failed (non-fatal):', (e as Error).message));

      if (isFromAd) {
        triggerCapiEvent('Lead', { tenantId: tenant.id, leadId: newLead.id })
          .catch(e => console.error('⚠️ CAPI trigger failed (CTWA lead):', e.message));
      }

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

  // ── CTWA Attribution: record lead in campaign_leads + attribution timeline ──
  // Must run after lead is resolved (existing or new).
  let ctwaContext = '';
  if (isFromAd && msg.referral) {
    ctwaContext = getCampaignContextForAI(msg.referral);
    processCtwaLead(
      tenant.id,
      cleanPhone,
      (lead as Record<string, any> | null)?.name ?? null,
      {
        source_type: msg.referral.source_type,
        source_id: msg.referral.source_id,
        headline: msg.referral.headline,
        body: msg.referral.body,
        ctwa_clid: msg.referral.ctwa_clid,
        source_url: msg.referral.source_url,
      }
    ).then(() => {
      console.log(`🎯 CTWA lead attributed for ${cleanPhone}, campaign source: ${msg.referral!.source_id}`);
    }).catch(ctwaErr => {
      console.warn('⚠️ CTWA attribution failed (non-fatal):', ctwaErr);
    });
  }

  // 5. Resolve/Create Conversation (initial fetch was done in parallel above)
  let conversation: Record<string, any> | null = null;

  if (activeExistingConv) {
    conversation = activeExistingConv;
    void supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeExistingConv.id);
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
  perf('lead+conv_resolved');

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
  const isMedia = ['image', 'video', 'audio', 'document', 'voice', 'sticker'].includes(msg.type);
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
  perf('msg_inserted');

  // Increment message counter (non-blocking — counter accuracy doesn't need to delay the reply)
  void supabaseAdmin.rpc('increment_message_count_conv', { conv_id: conversation.id });

  // Update conversation last_message_at for UI responsiveness
  void supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // 9. Fire Outbound Integration Webhook
  // SSRF guard: only fire to public HTTPS hosts. Blocks cloud-metadata,
  // loopback, and private-range targets a tenant could set in Settings.
  const outboundUrl = tenant.outbound_webhook_url;
  if (outboundUrl && !isSafeWebhookUrl(outboundUrl)) {
    console.warn('🚫 Outbound webhook blocked by SSRF guard:', outboundUrl);
  } else if (outboundUrl) {
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

  // 9.5. Opt-out / opt-in detection — check BEFORE AI runs
  // Handles STOP (opt-out) and START (opt-in) keywords per WhatsApp policy.
  const msgLower = msg.text?.toLowerCase().trim() || '';
  const STOP_KEYWORDS  = ['stop', 'unsubscribe', 'opt out', 'optout', 'cancel', 'quit', 'end', 'remove me'];
  const START_KEYWORDS = ['start', 'subscribe', 'opt in', 'optin', 'yes', 'join', 'resume'];

  if (STOP_KEYWORDS.some(k => msgLower === k)) {
    // Upsert into optouts table — sets is_active=true
    await supabaseAdmin.from('broadcast_optouts').upsert(
      { tenant_id: tenant.id, phone: cleanPhone, source: 'stop_keyword', opted_out_at: new Date().toISOString(), is_active: true },
      { onConflict: 'tenant_id,phone' }
    );
    // Also tag the lead for backwards compat with audience engine tag filter
    if (lead?.id) {
      const currentTags = (lead.tags as string[]) || [];
      if (!currentTags.includes('opt-out')) {
        await supabaseAdmin.from('leads').update({ tags: [...currentTags, 'opt-out'] }).eq('id', lead.id);
      }
    }
    // Send STOP confirmation (required by WhatsApp policy)
    if (decryptedAccessToken && tenant.wa_phone_number_id) {
      const stopMsg = `You've been unsubscribed from ${tenant.business_name || 'our'} messages. Reply START to resubscribe.`;
      await sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, stopMsg).catch(() => {});
    }
    console.log(`🚫 Opt-out recorded for ${cleanPhone} (tenant ${tenant.id})`);
    return;
  }

  if (START_KEYWORDS.some(k => msgLower === k)) {
    // Mark as opted back in
    await supabaseAdmin.from('broadcast_optouts')
      .update({ is_active: false, opted_back_in_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id).eq('phone', cleanPhone);
    // Remove opt-out tag from lead
    if (lead?.id) {
      const currentTags = (lead.tags as string[]) || [];
      await supabaseAdmin.from('leads')
        .update({ tags: currentTags.filter(t => !['opt-out', 'optout', 'unsubscribe', 'stop'].includes(t.toLowerCase())) })
        .eq('id', lead.id);
    }
    if (decryptedAccessToken && tenant.wa_phone_number_id) {
      const startMsg = `Welcome back! You're now subscribed to messages from ${tenant.business_name || 'us'}. 😊`;
      await sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, startMsg).catch(() => {});
    }
    console.log(`✅ Opt-in restored for ${cleanPhone} (tenant ${tenant.id})`);
    return;
  }

  // 10. Pause / Escalated checks
  // Skip AI entirely for message types that have no actionable text content
  if (msg.type === 'unsupported' || msg.type === 'sticker') {
    console.log(`⏭️ Meta: skipping AI for non-text message type "${msg.type}"`);
    return;
  }

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


  // 10.5. Business hours — compute ONCE, reused by both the off-hours guard and the AI prompt.
  // Hoisted outside the try-catch so both sections share the same computed values.
  let isBusinessOpen: boolean | undefined;
  let businessCurrentTimeIST: string | undefined;
  let businessHoursStr: string | undefined;

  try {
    const workingHours = tenant.working_hours as Record<string, string> | null;
    if (workingHours) {
      const nowUTC  = new Date();
      const nowIST  = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000);
      const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const todayKey = dayKeys[nowIST.getUTCDay()];
      const currentMins = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();

      for (const [key, val] of Object.entries(workingHours)) {
        const keys = key.toLowerCase().split('-');
        if (keys.includes(todayKey) ||
            (keys.length === 2 &&
              dayKeys.indexOf(keys[0]) <= dayKeys.indexOf(todayKey) &&
              dayKeys.indexOf(todayKey) <= dayKeys.indexOf(keys[1]))) {
          businessHoursStr = val as string;
          break;
        }
      }

      if (businessHoursStr) {
        const [openStr, closeStr] = businessHoursStr.split('-');
        const toMins = (t: string) => { const [h, m] = t.trim().split(':').map(Number); return h * 60 + (m || 0); };
        isBusinessOpen = currentMins >= toMins(openStr) && currentMins < toMins(closeStr);
        businessCurrentTimeIST = `${String(nowIST.getUTCHours()).padStart(2, '0')}:${String(nowIST.getUTCMinutes()).padStart(2, '0')}`;
      }
    }
  } catch (offHoursErr) {
    console.warn('⚠️ Business hours check failed (non-fatal):', offHoursErr);
  }

  // Off-hours guard: send ONE notice per 6-hour closed window per conversation.
  // Race-safe: acquireOffHoursLock uses Redis SET NX (atomic) — only the FIRST
  // concurrent request can acquire the lock; all others see 'already_sent'.
  if (isBusinessOpen === false && businessHoursStr) {
    const lockResult = await acquireOffHoursLock(conversation.id);

    let offHoursNoticeSent: boolean;
    if (lockResult === 'use_db_fallback') {
      // Redis unavailable — fall back to DB query (small race window is acceptable)
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recentMsg } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('conversation_id', conversation.id)
        .eq('direction', 'outbound')
        .eq('ai_generated', false)
        .gte('created_at', sixHoursAgo)
        .limit(1)
        .maybeSingle();
      offHoursNoticeSent = !!recentMsg;
    } else {
      offHoursNoticeSent = lockResult === 'already_sent';
    }

    if (offHoursNoticeSent) {
      console.log(`🌙 Off-hours: notice already sent for ${cleanPhone}, continuing with AI`);
      // intentionally falls through — AI handles subsequent closed-hours messages
    } else {
      const offHoursMsg = (tenant.off_hours_message as string) ||
        `We're currently closed. Our hours are ${businessHoursStr} (IST). We'll get back to you as soon as we open! 🙏`;
      if (decryptedAccessToken && tenant.wa_phone_number_id) {
        await sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, offHoursMsg);
        await supabaseAdmin.from('messages').insert({
          tenant_id: tenant.id, conversation_id: conversation.id,
          direction: 'outbound', content: offHoursMsg,
          message_type: 'text', channel: 'whatsapp',
          status: 'sent', ai_generated: false,
        });
      }
      console.log(`🌙 Off-hours: sent off-hours notice to ${cleanPhone}`);
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

  // isFirstMessage = truly the first message in this conversation session.
  // We use existingConv === null (newly created conversation) rather than
  // message_count because the counter is incremented non-blocking (void rpc),
  // so rapid second/third messages still see count=0 and falsely trigger welcome.
  const isFirstMessage = activeExistingConv === null;

  // 12+13. Fire the AI-context batch speculatively BEFORE the flow engine so its
  // DB time (~200-300ms) overlaps with the flow engine's own DB check (~50-150ms).
  // All 7 queries are pure reads — no side effects. If flows handle the message
  // the results are simply discarded; otherwise they're ready (or very close) when
  // the AI needs them, saving ~100-150ms on every non-flow message.
  const _aiBatchPromise = Promise.all([
    supabaseAdmin
      .from('messages')
      .select('direction, content')
      .eq('conversation_id', conversation.id)
      // Defence-in-depth: also filter by tenant_id so a race-condition that assigns
      // a conversation to the wrong tenant never bleeds another tenant's history into
      // this AI context. The admin client bypasses RLS so we enforce it explicitly.
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(10),
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
    // Look up customer's most recent confirmed/pending booking so AI can handle cancel/modify
    supabaseAdmin
      .from('restaurant_bookings')
      .select('reservation_id, booking_date, slot_time, party_size, booking_status, customer_name')
      .eq('restaurant_id', tenant.id)
      .eq('customer_phone', cleanPhone)
      .in('booking_status', ['confirmed', 'pending'])
      .order('booking_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Fetch KB doc text directly (no embedding — fast)
    supabaseAdmin
      .from('knowledge_docs')
      .select('filename, content_text')
      .eq('tenant_id', tenant.id)
      .neq('content_text', '')
      .limit(5),
    // Check if any docs have stored embeddings (for conditional RAG)
    supabaseAdmin
      .from('knowledge_docs')
      .select('id')
      .eq('tenant_id', tenant.id)
      .not('embedding', 'is', null)
      .limit(1),
    // Scripted replies — exact-match keyword intercepts that bypass AI entirely
    supabaseAdmin
      .from('scripted_replies')
      .select('keywords, reply')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true),
  ]);

  // 12. Flow Engine Execution (runs concurrently with _aiBatchPromise above)
  try {
    const flowHandled = await runFlowsForMessage(
      tenant.id,
      msg.text,
      cleanPhone,
      conversation.id,
      lead?.id ?? null,
      isFirstMessage,
      msg.type,        // "text" | "interactive" | "button" — for button_trigger matching
      msg.buttonId     // raw button reply id from Meta
    );
    if (flowHandled) {
      console.log(`✅ Flow engine handled message for conversation ${conversation.id}, skipping AI`);
      return;
    }
  } catch (flowErr) {
    console.error('❌ Flow engine error (falling back to AI):', (flowErr as Error).message);
  }
  perf('flows_done');

  const storedMsgCount = conversation.message_count ?? 0;

  // 13. Await the speculative batch (started before flows — likely already resolved)
  const [{ data: recentMsgs }, { data: smartRulesRows }, { data: agentRows }, { data: existingBookingRow }, { data: kbDocs }, { data: kbEmbedCheck }, { data: scriptedRepliesRows }] = await _aiBatchPromise;

  const history = (recentMsgs || [])
    .reverse()
    .slice(0, -1) // Exclude current message
    .map(m => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

  // Reliable first-message check: look for any prior outbound (assistant) messages.
  // storedMsgCount is stale (non-blocking update) so we use the actual fetched history.
  const isFirstMessageForAI = history.filter(h => h.role === 'assistant').length === 0;

  perf('parallel_fetch_done');

  // 13a. Scripted Replies — exact keyword intercept, bypasses AI entirely.
  // No tokens consumed, guaranteed wording. Checked before RAG/agent/AI.
  if (scriptedRepliesRows && scriptedRepliesRows.length > 0 && msg.text) {
    const lowerMsg = msg.text.toLowerCase();
    type ScriptedRow = { keywords: string[]; reply: string };
    const matchedScript = (scriptedRepliesRows as ScriptedRow[]).find(r =>
      Array.isArray(r.keywords) && r.keywords.some((kw: string) => lowerMsg.includes(kw.toLowerCase()))
    );
    if (matchedScript) {
      console.log(`⚡ Scripted reply matched for tenant ${tenant.id}: "${matchedScript.keywords.join(', ')}"`);
      if (decryptedAccessToken && tenant.wa_phone_number_id) {
        const sendResult = await sendTextMessage(
          decryptedAccessToken,
          tenant.wa_phone_number_id as string,
          cleanPhone,
          matchedScript.reply
        ).catch((e: Error) => { console.error('❌ Scripted reply send failed:', e.message); return null; });
        // Save outbound message to DB
        void supabaseAdmin.from('messages').insert({
          tenant_id: tenant.id,
          conversation_id: conversation.id,
          direction: 'outbound',
          content: matchedScript.reply,
          message_type: 'text',
          channel: 'whatsapp',
          status: sendResult ? 'sent' : 'failed',
          ai_generated: false,
          wa_message_id: sendResult?.messageId ?? null,
        });
      }
      return;
    }
  }

  // RAG (semantic doc search) only earns its ~500-700ms embedding round-trip
  // when there are MORE docs than we'd inject anyway. The batch above already
  // fetched up to 5 docs; if it returned fewer than 5, that IS the tenant's
  // entire knowledge base, so ranking can't change which docs the AI sees —
  // we skip the embedding call and feed those docs directly. RAG still runs
  // for large knowledge bases (5+ docs) where it picks the best matches.
  const KB_FETCH_LIMIT = 5;
  let knowledgeRows: Array<{ filename: string; content_text: string }> = (kbDocs || []) as Array<{ filename: string; content_text: string }>;
  if (kbEmbedCheck && kbEmbedCheck.length > 0 && (kbDocs?.length ?? 0) >= KB_FETCH_LIMIT) {
    const ragDocs = await retrieveRelevantDocs(tenant.id, msg.text, 3).catch(() => []);
    if (ragDocs.length > 0) knowledgeRows = ragDocs;
  }

  const lowerMsgText = msg.text.toLowerCase();
  type AgentRow = { agent_name: string; routing_keywords: string[]; bot_name?: string; bot_personality?: string; system_prompt?: string };
  const activeAgents = (agentRows as AgentRow[] | null) ?? [];

  // 1. Try keyword match first
  // 2. Fall back to a "default" agent — one with no routing keywords configured (catch-all)
  // This is how trained behavior flows even without keywords
  const matchedAgent =
    activeAgents.find(agent =>
      agent.routing_keywords?.length > 0 &&
      agent.routing_keywords.some((kw: string) => lowerMsgText.includes(kw.toLowerCase()))
    ) ??
    activeAgents.find(agent => !agent.routing_keywords || agent.routing_keywords.length === 0) ??
    null;

  const baseConfig = getTenantConfig(tenant);
  const tenantConfig = {
    ...baseConfig,
    isFirstMessage: isFirstMessageForAI,
    ctwaContext,
    // Business hours status — AI uses this to avoid confirming bookings while closed
    ...(businessHoursStr !== undefined ? {
      businessIsOpen: isBusinessOpen ?? true,
      businessCurrentTime: businessCurrentTimeIST,
      businessHours: businessHoursStr,
    } : {}),
    smartRules: (smartRulesRows || []) as Array<{ name: string; trigger_source: string; ai_summary: string }>,
    knowledgeDocs: knowledgeRows,
    // Inject existing booking so AI can handle cancel/modify requests
    existingBooking: existingBookingRow ? {
      reservationId:  (existingBookingRow as any).reservation_id,
      date:           (existingBookingRow as any).booking_date,
      time:           (existingBookingRow as any).slot_time,
      partySize:      (existingBookingRow as any).party_size,
      status:         (existingBookingRow as any).booking_status,
      customerName:   (existingBookingRow as any).customer_name,
    } : null,
    // Repeat-visitor recognition
    visitCount:    (lead?.visit_count as number) ?? 0,
    lastVisitDate: (lead?.last_visit_date as string) ?? null,
    ...(matchedAgent ? {
      botName: matchedAgent.bot_name || baseConfig.botName,
      botPersonality: matchedAgent.bot_personality || baseConfig.botPersonality,
      systemPrompt: matchedAgent.system_prompt || baseConfig.systemPrompt,
    } : {}),
  };
  const context = (conversation.context as Record<string, any>) || {};

  // Show "typing…" to the customer while the AI generates. Fire-and-forget:
  // we're past the bot_paused / escalation guards, so the bot WILL reply, and
  // WhatsApp clears the bubble the moment our reply lands (or after 25s).
  if (decryptedAccessToken && tenant.wa_phone_number_id) {
    sendTypingIndicator(decryptedAccessToken, tenant.wa_phone_number_id, msg.messageId).catch(() => {});
  }

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
    Sentry.captureException(err);
    // Alert operator — customer received no reply. Debounced 5 min per tenant
    // so a sustained Vertex outage doesn't flood the inbox.
    notifyAdmin({
      dedupeKey: `ai-engine-fail:${tenant.id}`,
      subject: `AI engine error — ${tenant.business_name || tenant.id}`,
      summary:
        `The AI engine failed to generate a reply. Customers messaging this tenant ` +
        `are receiving no response. Check Vertex AI status and Vercel function logs.`,
      context: {
        tenantId: tenant.id,
        businessName: tenant.business_name,
        recipient: cleanPhone,
        error: (err as Error).message,
        messagePreview: msg.text?.slice(0, 120),
      },
    }).catch((e) => console.error('notifyAdmin failed:', (e as Error).message));
    return;
  }
  perf('ai_done');

  if (!aiResponse?.reply) {
    console.warn(`⚠️ Meta: AI returned empty reply for tenant ${tenant.id}, conversation ${conversation.id}`);
    return;
  }

  // 13b. Increment AI conversation counter (non-blocking)
  void supabaseAdmin.rpc('increment_ai_conversations', { p_tenant_id: tenant.id });

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
  let sendFailureMsg: string | null = null;
  if (!decryptedAccessToken || !tenant.wa_phone_number_id) {
    sendFailureMsg = !decryptedAccessToken
      ? 'missing/undecryptable wa_access_token'
      : 'missing wa_phone_number_id';
    console.error(`❌ Meta: ${sendFailureMsg} for tenant ${tenant.id}`);
  } else {
    try {
      const result = await sendTextMessage(
        decryptedAccessToken,
        tenant.wa_phone_number_id,
        cleanPhone,
        aiResponse.reply
      );
      metaMsgId = result.messageId;
    } catch (sendErr) {
      sendFailureMsg = (sendErr as Error).message;
      console.error('❌ Meta: failed to send AI reply:', sendFailureMsg);
      Sentry.captureException(sendErr);
    }
  }
  if (sendFailureMsg) {
    // Out-of-band: kick off the admin alert. Don't await — webhook must still
    // return 200 to Meta within timeout. The notifyAdmin path debounces.
    notifyAdmin({
      dedupeKey: `wa-send-fail:${tenant.id}`,
      subject: `WhatsApp send failed for ${tenant.business_name || tenant.id}`,
      summary:
        `AI reply was generated but Meta send failed. Customers messaging this ` +
        `tenant are not receiving any response. Check tenant credentials and ` +
        `Vercel logs immediately.`,
      context: {
        tenantId: tenant.id,
        businessName: tenant.business_name,
        recipient: cleanPhone,
        error: sendFailureMsg,
        replyPreview: aiResponse.reply.slice(0, 200),
      },
    }).catch((e) => console.error('notifyAdmin failed:', (e as Error).message));
  }
  perf('send_done');

  // 16 + 17. Save outbound message + update conversation context IN PARALLEL
  //
  // Context update uses an atomic PostgreSQL RPC (update_conversation_after_ai) that
  // merges via the || JSONB operator inside a single UPDATE statement.  PostgreSQL's
  // row-level locking serialises concurrent calls on the same conversation row, so
  // concurrent AI calls each accumulate their extracted fields rather than overwriting.
  //
  // DO NOT revert to .update({ context: fullObject }) — that is a full-overwrite
  // read-modify-write pattern and loses fields under concurrent load (proven by
  // conversation-race-test.mjs, 6/6 runs with field loss at 3+ concurrent messages).

  const BOOKING_CONTEXT_FIELDS = [
    'name', 'phone', 'email', 'guestCount', 'date', 'time', 'occasion',
    'eventType', 'companyName', 'specialRequests',
    'booking_saved', 'booking_reservation_id',
    'booking_date', 'booking_time', 'party_size',
  ];

  const prevContext = context as Record<string, any>;
  const extracted = (aiResponse.extractedData as Record<string, any>) ?? {};

  // Build top-level context delta: only newly extracted non-null values.
  // Existing fields not in the delta are preserved by PostgreSQL's || operator.
  // inactivity_flow_fired_* and pending_flow_node are NOT in the delta — they
  // survive untouched via ||.
  const contextDelta: Record<string, any> = {};
  for (const field of BOOKING_CONTEXT_FIELDS) {
    const v = extracted[field];
    if (v !== null && v !== undefined && v !== 'null') contextDelta[field] = v;
  }

  const newBookingIntents = ['reserve_table', 'private_event', 'corporate_booking'];
  const newBookingSteps = ['ask_guests', 'ask_date', 'ask_time', 'ask_name', 'ask_phone'];
  const isNewBookingFlow =
    newBookingIntents.includes(aiResponse.intent) ||
    newBookingSteps.includes(aiResponse.nextStep);

  // Booking reset: new booking started after a previous one completed.
  // Explicitly zero out old booking fields in the delta so || overwrites them.
  const isBookingReset = isNewBookingFlow && !!prevContext.booking_saved;
  if (isBookingReset) {
    console.log(`🔄 New booking flow detected — resetting booking_saved flag`);
    contextDelta.booking_saved = false;
    contextDelta.booking_reservation_id = null;
    for (const f of ['date', 'time', 'guestCount', 'name', 'phone']) {
      contextDelta[f] = extracted[f] ?? null;
    }
  }

  // Build booking_state delta: only the fields extracted by THIS message.
  // The DB function merges this into the existing booking_state atomically.
  const bsFieldMap: [string, string][] = [
    ['guest_count', 'guestCount'],
    ['date',        'date'],
    ['time',        'time'],
    ['name',        'name'],
    ['phone',       'phone'],
  ];
  const bookingStateDelta: Record<string, unknown> = {};
  for (const [bsKey, extractKey] of bsFieldMap) {
    const v = extracted[extractKey];
    if (v && v !== 'null') bookingStateDelta[bsKey] = v;
  }
  if (contextDelta.booking_saved) {
    bookingStateDelta.booking_confirmed = true;
    if (contextDelta.booking_reservation_id) {
      bookingStateDelta.reservation_id = contextDelta.booking_reservation_id;
    }
  }

  // Run BOTH DB writes in parallel — saves ~30-60ms
  const [{ error: aiMsgErr }] = await Promise.all([
    supabaseAdmin.from('messages').insert({
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
      error_message: sendFailureMsg,
      failure_reason: sendFailureMsg ? sendFailureMsg.slice(0, 80) : null,
    }),
    supabaseAdmin.rpc('update_conversation_after_ai', {
      p_conv_id:             conversation.id,
      p_context_delta:       contextDelta,
      p_booking_state_delta: bookingStateDelta,
      p_booking_state_reset: isBookingReset,
      p_current_step:        aiResponse.nextStep,
      p_last_message_at:     new Date().toISOString(),
      p_escalated:           aiResponse.shouldEscalate,
      p_escalated_at:        aiResponse.shouldEscalate ? new Date().toISOString() : null,
      p_escalation_reason:   aiResponse.escalationReason || null,
    }),
  ]);

  if (aiMsgErr) {
    console.error('❌ Meta: failed to save AI outbound message:', aiMsgErr.message);
  }


  // 18. Schedule follow-ups for new WhatsApp leads (first message only)
  // Instagram has this logic; WhatsApp was completely missing it.
  if (isFirstMessage && lead?.id) {
    const now = Date.now();
    const followUpConfigs = [
      { enabled: tenant.followup_30min, type: '30min',  delayMs: 30 * 60 * 1000 },
      { enabled: tenant.followup_3hr,   type: '3hr',    delayMs: 3 * 60 * 60 * 1000 },
      { enabled: tenant.followup_24hr,  type: '24hr',   delayMs: 24 * 60 * 60 * 1000 },
      { enabled: tenant.followup_7day,  type: '7day',   delayMs: 7 * 24 * 60 * 60 * 1000 },
    ];

    const followUpsToInsert = followUpConfigs
      .filter(c => c.enabled)
      .map(c => ({
        id:              randomUUID(),
        tenant_id:       tenant.id,
        lead_id:         lead!.id,
        conversation_id: conversation.id,
        follow_up_type:  c.type,
        scheduled_at:    new Date(now + c.delayMs).toISOString(),
        message:         null,
        ai_generated:    true,
        status:          'pending',
      }));

    if (followUpsToInsert.length > 0) {
      // Bulk insert — ON CONFLICT DO NOTHING prevents duplication on retry
      try {
        await supabaseAdmin.from('follow_ups')
          .upsert(followUpsToInsert, { onConflict: 'id', ignoreDuplicates: true });
      } catch (e: any) {
        console.error('⏰ Failed to schedule follow-ups:', e?.message || e);
      }
      console.log(`⏰ Scheduled ${followUpsToInsert.length} follow-up(s) for lead ${lead.id}`);

      // Register each with the engine (now actually writes to DB if not already there)
      for (const fu of followUpsToInsert) {
        const config = followUpConfigs.find(c => c.type === fu.follow_up_type)!;
        scheduleFollowUp({
          followUpId:      fu.id,
          tenantId:        tenant.id,
          leadId:          lead!.id,
          conversationId:  conversation.id,
          followUpType:    fu.follow_up_type,
          message:         null,
          leadPhone:       cleanPhone,
          leadName:        lead?.name || 'Customer',
          delayMs:         config.delayMs,
        }).catch(() => {});
      }
    }
  }

  // 18b. Update Lead Score (non-blocking — doesn't affect reply latency)
  if (lead?.id && aiResponse.intent) {
    const scoreMap: Record<string, number> = {
      human_request: 60, complaint: 30, reserve_table: 80, private_event: 85,
      corporate_booking: 90, confirm: 95, cancel: 20, pricing: 65,
      general_enquiry: 40, greeting: 20, unknown: 10,
    };
    const newScore = scoreMap[aiResponse.intent] ?? (lead.lead_score as number);
    const newStatus = newScore >= 80 ? 'hot' : newScore >= 50 ? 'warm' : 'cold';

    void supabaseAdmin
      .from('leads')
      .update({ lead_score: newScore, lead_status: newStatus })
      .eq('id', lead.id);
  }

  // 19. Auto-Save AI Booking to Database & Google Sheets
  const updatedContext = { ...context, ...contextDelta };
  const contextObj = updatedContext as Record<string, any>;
  const bookingDateRaw = contextObj.date || contextObj.booking_date;
  const bookingTimeRaw = contextObj.time || contextObj.booking_time;
  const bookingGuestsRaw = contextObj.guestCount || contextObj.party_size;
  const customerPhone = contextObj.phone || cleanPhone; // use context phone if captured, else WhatsApp number

  // Detect booking confirmation using structured AI fields ONLY.
  // Previously this also matched reply text (fragile — "table for" in any message
  // would trigger a DB write). Now we rely solely on the AI's structured output.
  const hasConfirmSignal =
    aiResponse.intent === 'confirm' ||
    aiResponse.nextStep === 'completed' ||
    aiResponse.nextStep === 'confirmation';

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
      
      // Use AI extractedData fields directly — the AI already handled language,
      // Hindi dates, ambiguous formats, "kal", "tonight", etc. far better than
      // the custom regex parseDatetime() which only understood English.
      // Fall back to parseDatetime only if AI gave us raw unparsed strings.
      let bookingDate: string;
      let slotTime: string;
      const aiDate = aiResponse.extractedData?.date || '';
      const aiTime = aiResponse.extractedData?.time || '';
      if (aiDate && /^\d{4}-\d{2}-\d{2}$/.test(aiDate)) {
        // AI gave us ISO date directly
        bookingDate = aiDate;
      } else {
        const parsed = parseDatetime(`${bookingDateRaw} ${bookingTimeRaw}`);
        bookingDate = parsed.bookingDate;
      }
      if (aiTime && /^\d{2}:\d{2}/.test(aiTime)) {
        slotTime = aiTime.slice(0, 8).padEnd(8, ':00');
      } else {
        const parsed = parseDatetime(`${bookingDateRaw} ${bookingTimeRaw}`);
        slotTime = parsed.slotTime;
      }
      console.log(`   ↳ Date/time: date=${bookingDate} time=${slotTime} (ai_date="${aiDate}" ai_time="${aiTime}")`);
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

      // 1. Sync to Google Sheets (non-blocking — don't delay WhatsApp reply)
      appendBookingRow(tenant.id, bookingPayload)
        .then(() => console.log(`   ✅ Google Sheets booking row saved successfully.`))
        .catch((sheetsErr: any) => console.error(`   ❌ Google Sheets booking save FAILED: ${sheetsErr.message}`));

      // 2. Find best matching slot by time — pick the slot whose slot_time is
      //    closest to the requested slotTime. Fall back to creating a default.
      const { data: allSlots } = await supabaseAdmin
        .from('restaurant_slots')
        .select('id, slot_time, total_capacity')
        .eq('restaurant_id', tenant.id)
        .eq('is_active', true)
        .order('slot_time', { ascending: true });

      let slotId: string | null = null;
      let chosenSlot: { id: string; slot_time: string; total_capacity: number } | null = null;

      if (allSlots && allSlots.length > 0) {
        // Find the slot whose time is closest to the requested slotTime
        const [reqH, reqM] = slotTime.split(':').map(Number);
        const reqMins = reqH * 60 + reqM;
        let minDiff = Infinity;
        for (const s of allSlots as Array<{ id: string; slot_time: string; total_capacity: number }>) {
          const [sH, sM] = s.slot_time.split(':').map(Number);
          const diff = Math.abs(sH * 60 + sM - reqMins);
          if (diff < minDiff) { minDiff = diff; chosenSlot = s; slotId = s.id; }
        }
      }

      if (!slotId) {
        // No slots configured — create a sensible default for this tenant
        const { data: newSlot } = await supabaseAdmin
          .from('restaurant_slots')
          .insert({
            restaurant_id: tenant.id,
            slot_time: slotTime || '19:30:00',
            day_type: 'both',
            total_capacity: 50,
            is_active: true
          })
          .select()
          .single();
        if (newSlot) {
          slotId = newSlot.id;
          chosenSlot = newSlot as { id: string; slot_time: string; total_capacity: number };
        }
      }

      let bookingWritten = false; // true only when the DB row was actually inserted

      if (!slotId || !chosenSlot) {
        console.error('❌ AI Auto-Book: could not resolve a slot for this tenant');
        // Skip DB write — booking will be retried on next message
      } else {
        // ── CAPACITY CHECK — prevents double-booking ─────────────────────────
        // Calls the check_seat_availability RPC which uses FOR SHARE lock to
        // prevent concurrent bookings exceeding capacity.
        const { data: availData, error: availErr } = await supabaseAdmin
          .rpc('check_seat_availability', {
            p_slot_id:      slotId,
            p_booking_date: bookingDate,
            p_party_size:   guestCount,
          });

        const avail = availData as { available: boolean; remaining_seats: number; error?: string } | null;

        if (availErr || !avail) {
          console.error('❌ AI Auto-Book: capacity check failed:', availErr?.message);
          // Fail safe — abort booking rather than risk overbooking
        } else if (!avail.available) {
          // ── SLOT FULL — tell the customer and suggest alternatives ─────────
          console.warn(`⚠️ AI Auto-Book: slot full (${avail.remaining_seats} seats left, need ${guestCount})`);

          // Query other available slots for this date so we can suggest them
          const { data: altSlots } = await supabaseAdmin
            .rpc('check_seat_availability', {
              p_slot_id:      slotId,
              p_booking_date: bookingDate,
              p_party_size:   guestCount,
            });
          void altSlots; // used for future alternative-slot suggestions

          // Find all slots with availability for this date
          const { data: slotsForDate } = await supabaseAdmin
            .from('restaurant_slots')
            .select('id, slot_time')
            .eq('restaurant_id', tenant.id)
            .eq('is_active', true);

          // Check all alternative slots in PARALLEL — eliminates waterfall of sequential RPC calls
          const otherSlots = ((slotsForDate || []) as Array<{ id: string; slot_time: string }>).filter(s => s.id !== slotId);
          const altResults = await Promise.all(
            otherSlots.map(async (s) => {
              const { data: altAvail } = await supabaseAdmin.rpc('check_seat_availability', {
                p_slot_id:      s.id,
                p_booking_date: bookingDate,
                p_party_size:   guestCount,
              });
              return { slot: s, available: (altAvail as { available: boolean } | null)?.available ?? false };
            })
          );
          const availableAlternatives: string[] = altResults
            .filter(r => r.available)
            .map(r => {
              const [h, m] = r.slot.slot_time.split(':');
              const hr = parseInt(h);
              const ampm = hr >= 12 ? 'PM' : 'AM';
              const hr12 = hr > 12 ? hr - 12 : hr;
              return `${hr12}:${m} ${ampm}`;
            });

          // Send "fully booked" message with alternatives
          const waPhoneId = tenant.wa_phone_number_id as string;
          if (decryptedAccessToken && waPhoneId) {
            const altText = availableAlternatives.length > 0
              ? `\n\nAlternative slots available: ${availableAlternatives.slice(0, 3).join(', ')}`
              : '\n\nPlease contact us for availability on another date.';
            const fullMsg = `Sorry ${customerName}, our ${slotTime.slice(0,5)} slot on ${bookingDate} is fully booked (${avail.remaining_seats} seats left).${altText}\n\nWould you like to book one of these instead?`;
            await sendTextMessage(decryptedAccessToken, waPhoneId, cleanPhone, fullMsg).catch(() => {});
            // Log as outbound message
            try {
              await supabaseAdmin.from('messages').insert({
                tenant_id:        tenant.id,
                conversation_id:  conversation.id,
                direction:        'outbound',
                content:          fullMsg,
                message_type:     'text',
                channel:          'whatsapp',
                status:           'sent',
                ai_generated:     false,
              });
            } catch (err) {
              // Ignore insert error
            }
          }
          // Clear booking context so customer can choose alternative
          contextObj.booking_saved   = false;
          contextObj.date            = null;
          contextObj.time            = null;
          contextObj.booking_date    = null;
          contextObj.booking_time    = null;
          await supabaseAdmin
            .from('conversations')
            .update({ context: contextObj })
            .eq('id', conversation.id);
          // Abort — do NOT fall through to Sheets / DB insert
        } else {
          // ── CAPACITY AVAILABLE — proceed with booking ─────────────────────
          console.log(`   ✅ Capacity OK: ${avail.remaining_seats} seats remaining after this booking`);

          const { error: dbInsertErr } = await supabaseAdmin.from('restaurant_bookings').insert({
            restaurant_id:    tenant.id,
            slot_id:          slotId,
            booking_date:     bookingDate,
            customer_name:    customerName,
            customer_phone:   customerPhone,
            party_size:       guestCount,
            payment_amount:   payAmount,
            payment_status:   payStatus,
            booking_status:   'confirmed',
            reservation_id:   reservationId,
            source:           'ai_whatsapp',
            ...(contextObj.specialRequests && { special_request: String(contextObj.specialRequests) }),
            ...(paymentLink && { payment_link_url: paymentLink.short_url, payment_link_id: paymentLink.id }),
          });
          if (dbInsertErr) {
            console.error('❌ AI Auto-Book DB save failed:', dbInsertErr.message);
          } else {
            bookingWritten = true;
            console.log(`   ✅ Saved to restaurant_bookings (ID: ${reservationId}, payment: ${payStatus}).`);
          }
        }
      }

      // 2b. Only run post-booking steps when the booking was actually saved
      if (!bookingWritten) {
        console.log(`   ℹ️ Booking not written (capacity issue or slot error) — skipping post-booking steps`);
      }

      if (bookingWritten && isPrepaid && paymentLink) {
        const waPhoneId  = (tenant as any).wa_phone_number_id as string;
        if (decryptedAccessToken && waPhoneId) {
          const payMsg = `🎉 Almost done, ${customerName}!\n\nTo confirm your table for ${guestCount} guest${guestCount !== 1 ? 's' : ''} on ${bookingDate}, please pay the ₹${feeRupees} booking fee:\n\n💳 ${paymentLink.short_url}\n\nReservation ID: ${reservationId}`;
          sendTextMessage(decryptedAccessToken, waPhoneId, customerPhone, payMsg).catch(e =>
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
      } else if (bookingWritten) {
        // Free booking confirmed — fire booking_confirmed integrations
        fireIntegrations({
          type: 'booking_confirmed',
          tenantId: tenant.id,
          lead: { name: customerName, phone: customerPhone },
          details: { reservation_id: reservationId, party_size: String(guestCount), date: bookingDate, time: slotTime },
        }).catch(() => {});
      }

      // 3. Mark booking_saved ONLY when the row was actually written to DB
      if (bookingWritten) {
        contextObj.booking_saved = true;
        contextObj.booking_reservation_id = reservationId;
        await supabaseAdmin
          .from('conversations')
          .update({ context: contextObj })
          .eq('id', conversation.id);
        console.log(`   ✅ Conversation context marked booking_saved=true.`);

        // CTWA: mark the campaign lead as having made a booking
        if (isFromAd) {
          import('@/lib/meta-ads/attribution').then(({ markLeadBooking }) => {
            markLeadBooking(tenant.id, cleanPhone, {
              reservation_id: reservationId,
              booking_date: bookingDate,
              slot_time: slotTime,
            }).catch(() => {});
          }).catch(() => {});
        }

        // B2: increment visit count for repeat-visitor recognition
        if (lead?.id) {
          try {
            await supabaseAdmin
              .from('leads')
              .update({
                visit_count: ((lead.visit_count as number) ?? 0) + 1,
                last_visit_date: bookingDate,
              })
              .eq('id', lead.id);
          } catch (e: any) {
            console.error('Failed to increment visit_count:', e?.message || e);
          }
        }
      }

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

  // Resolve tenant from the phone number ID — ensures status updates are scoped per tenant.
  let tenantIdForStatus: string | null = null;
  if (msg.appPhoneId) {
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('wa_phone_number_id', msg.appPhoneId)
      .maybeSingle();
    tenantIdForStatus = tenantRow?.id ?? null;
  }

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

    let updateQuery = supabaseAdmin
      .from('messages')
      .update({ status: mappedStatus })
      .eq('wa_message_id', msg.messageId);
    if (tenantIdForStatus) updateQuery = updateQuery.eq('tenant_id', tenantIdForStatus);
    const { data: updated, error } = await updateQuery.select('id');

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
    let deliveryQuery = supabaseAdmin
      .from('broadcast_deliveries')
      .update({
        status: mappedStatus,
        ...(mappedStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
        ...(mappedStatus === 'read' && { read_at: new Date().toISOString() })
      })
      .eq('message_id', msg.messageId);
    if (tenantIdForStatus) deliveryQuery = deliveryQuery.eq('tenant_id', tenantIdForStatus);
    const { data: updatedDelivery } = await deliveryQuery.select('campaign_id');

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
