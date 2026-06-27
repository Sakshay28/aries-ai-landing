// ═══════════════════════════════════════════════════════════
// 📥 Meta WhatsApp Webhook Handler (Multi-Tenant)
// ═══════════════════════════════════════════════════════════
// Handles Meta's webhook verification handshake (GET) and
// processes incoming messages and status updates (POST).
// Uses after() to keep responses under Meta's 5s timeout.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isDuplicateMessage, getRedisClient, acquireOffHoursLock, acquireOnceNotice } from '@/lib/redis/client';
import { createPaymentLink } from '@/lib/payments/razorpay-links';
import { retrieveRelevantDocs } from '@/lib/ai/rag';
import { appendLeadRow, appendBookingRow } from '@/lib/integrations/google-sheets';
import { parseMetaWebhook, sendTextMessage, sendMediaMessage, getMediaUrl, verifySignature, markMessageAsRead, sendTypingIndicator, sendStaffAlert } from '@/lib/meta/service';
import { isSafeWebhookUrl } from '@/lib/utils/ssrf';
import { processMessageWithAI, isHumanHandoffRequest } from '@/lib/ai/engine';
import { kwWordMatch, pickScriptedReply, allowStatusUpdate } from '@/lib/webhook/decisions';
import { checkSenderRateLimit } from '@/lib/abuse/prevention';
import { checkAICostLimit, checkDailyAICostLimit, AI_FALLBACK_MESSAGE } from '@/lib/billing/costProtection';
import { getTenantByPhoneNumberId, getTenantConfig } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { runFlowsForMessage } from '@/lib/flows/engine';
import { fireIntegrations, createBookingPaymentLink } from '@/lib/integrations/runner';
import { sendLeadAssignedEmail } from '@/lib/email/service';
import { scheduleFollowUp, cancelLeadFollowUps } from '@/lib/followup/engine';
import { randomUUID } from 'crypto';
import { triggerCapiEvent } from '@/lib/integrations/capi-trigger';
import { processCtwaLead, getCampaignContextForAI } from '@/lib/meta-ads/attribution';
import { notifyAdmin } from '@/lib/alerts/admin';
import { sendBookingAlertEmail } from '@/lib/alerts/bookingEmail';
import { isCoexistenceChange, handleCoexistenceWebhook } from '@/lib/webhook/coexistence';
import { toSignedMediaUrl } from '@/lib/utils/storage';
import { triggerAutomations, cancelLeadAutomations } from '@/lib/automations/engine';
import { resolveBookingVariables } from '@/lib/automations/variables';
import { zonedDateTimeToUtc } from '@/lib/utils/datetime';
import * as Sentry from '@/lib/sentry-stub';
import { calculateLeadScore } from '@/lib/scoring/lead-scoring-engine';
import { logScoringEvents, logStatusChange } from '@/lib/scoring/event-logger';
import { normalizeIndustry } from '@/lib/scoring/industry-profiles';

// Infer WhatsApp media type from a stored URL's file extension.
// Used so scripted replies and the welcome media can carry videos/docs
// without needing a separate media_type column in the DB.
function mediaTypeFromUrl(url: string): 'image' | 'video' | 'document' {
  const lower = url.toLowerCase().split('?')[0];
  if (/\.(mp4|mov|webm|m4v|avi)$/.test(lower)) return 'video';
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/.test(lower)) return 'document';
  return 'image';
}


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
    // No secret configured at all.
    // In production, reject unsigned requests — a missing secret is a misconfiguration,
    // not an expected operating mode. In development, warn and continue.
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Meta Webhook: META_APP_SECRET not set and no per-tenant wa_app_secret found — rejecting unsigned request in production.');
      return new Response('Unauthorized', { status: 401 });
    }
    console.warn('⚠️ META_APP_SECRET not set — skipping signature verification (development only). Set META_APP_SECRET in Vercel env vars.');
  }

  // ── Coexistence events (smb_message_echoes / history / smb_app_state_sync) ──
  // These are only emitted for numbers onboarded via Coexistence. The normal
  // parser returns null for them, so they were silently dropped before. Route
  // them to their dedicated handlers and return 200 immediately. The live
  // inbound/status/reaction path below is left completely untouched.
  const change = body?.entry?.[0]?.changes?.[0];
  if (isCoexistenceChange(change?.field, change?.value)) {
    after(async () => {
      try {
        await handleCoexistenceWebhook(change?.field, change?.value);
      } catch (err) {
        console.error('❌ Coexistence webhook processing error:', err);
        Sentry.captureException(err);
      }
    });
    return NextResponse.json({ ok: true });
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
  // CRITICAL: Meta's media URLs are temporary signed S3 URLs that expire in ~5 minutes.
  // We MUST download the binary and re-upload to Supabase Storage for a permanent URL.
  // Without this, all images/videos/audio in the inbox appear broken after a few minutes.
  let content = msg.text;
  let resolvedMediaUrl: string | null = null;

  if (msg.mediaId) {
    if (decryptedAccessToken) {
      try {
        // Step 1: Get the temporary Meta URL (the URL itself needs auth to download)
        const tempUrl = await getMediaUrl(decryptedAccessToken, msg.mediaId);

        if (tempUrl) {
          // Step 2: Download the actual media binary from Meta (requires Bearer token)
          const mimeType = msg.mediaMimeType || 'application/octet-stream';
          let ext = mimeType.split('/')[1]?.split(';')[0]?.split('+')[0] || 'bin';
          // Normalize common extensions
          if (ext === 'mpeg') ext = 'mp3';
          if (ext === 'quicktime') ext = 'mov';
          if (ext === 'x-m4a') ext = 'm4a';

          const mediaResp = await fetch(tempUrl, {
            headers: { 'Authorization': `Bearer ${decryptedAccessToken}` },
            signal: AbortSignal.timeout(20000),
          });

          if (mediaResp.ok) {
            // Step 3: Upload to Supabase Storage (whatsapp-media bucket)
            const mediaBuffer = await mediaResp.arrayBuffer();
            const storagePath = `${tenant.id}/${msg.mediaId}.${ext}`;

            const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
              .from('whatsapp-media')
              .upload(storagePath, mediaBuffer, {
                contentType: mimeType,
                upsert: true,
                cacheControl: '31536000', // 1 year cache
              });

            if (!uploadErr && uploadData) {
              // Step 4: Get permanent public URL
              const { data: urlData } = supabaseAdmin.storage
                .from('whatsapp-media')
                .getPublicUrl(storagePath);
              resolvedMediaUrl = urlData.publicUrl;
              content = msg.mediaCaption || msg.text || `[${msg.type}]`;
              console.log(`📸 Media stored permanently: ${resolvedMediaUrl}`);
            } else {
              // Upload failed — fallback to temp URL (will expire but better than blank)
              resolvedMediaUrl = tempUrl;
              content = msg.mediaCaption || msg.text || `[${msg.type}]`;
              console.warn(`⚠️ Media storage upload failed (${uploadErr?.message}), using temp URL`);
            }
          } else {
            // Download from Meta failed
            console.error(`❌ Media download from Meta failed: ${mediaResp.status}`);
            resolvedMediaUrl = tempUrl; // still store temp URL as fallback
            content = msg.text || `[${msg.type}]`;
          }
        }
      } catch (mediaErr) {
        console.error('❌ Media pipeline error:', (mediaErr as Error).message);
        // Don't throw — process the message without media rather than failing entirely
        content = msg.text || `[${msg.type}]`;
      }
    }
  }

  // For messages Meta couldn't deliver (type:"unsupported"), persist WHY alongside
  // the marker so the inbox shows a useful reason instead of a blank placeholder.
  // ChatArea matches on the "[unsupported]" prefix, so appending the reason is safe.
  if (msg.type === 'unsupported' && msg.errorReason) {
    content = `[unsupported]: ${msg.errorReason}`;
  }

  // 4. Resolve/Create Lead — ATOMIC upsert prevents duplicate-lead race condition.
  // The UNIQUE(tenant_id, phone) DB constraint + ON CONFLICT ensures only one row
  // per phone number per tenant, even with 3 concurrent webhook deliveries.
  const cleanPhone = msg.fromPhone.replace(/\D/g, '');
  let lead: Record<string, any> | null = null;

  const isFromAd = !!msg.referral && msg.referral.source_type === 'ad';
  const leadSource = isFromAd ? 'meta_ctwa' : 'whatsapp';

  // Leads are stored with a "+" prefix in the DB (e.g. "+918233451667") but Meta
  // delivers the sender phone without "+" (e.g. "918233451667"). Search both formats
  // so we never miss an existing lead regardless of how it was originally created.
  const leadPhone = '+' + cleanPhone; // canonical form for lead storage
  // Fetch lead + ALL conversations for this contact in parallel (independent queries).
  // IMPORTANT: conversation lookup checks BOTH "+91..." and "91..." formats to prevent
  // duplicates when the same phone was stored in different formats on different events.
  //
  // P0 ROOT-CAUSE FIX (orphaned conversations / "messages missing in dashboard"):
  // We DO NOT filter on is_active here. The nightly cron (processStaleConversations)
  // flips every conversation idle >24h to is_active=false. The previous lookup required
  // is_active=true, so the FIRST message after a quiet day found nothing → a brand-new
  // empty conversation was created and the message was saved there, ORPHANED from the
  // contact's real history (which stayed on the now-inactive canonical thread). The
  // dashboard, viewing the canonical thread, never saw the new message.
  //
  // Now: find every thread for the contact, pick the oldest as canonical (matching the
  // dedup migration's "oldest wins" invariant), and ALWAYS reuse + reactivate it.
  const [{ data: existingLead }, { data: existingConvs }] = await Promise.all([
    supabaseAdmin.from('leads').select('*').eq('tenant_id', tenant.id).in('phone', [leadPhone, cleanPhone]).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('conversations').select('*').eq('tenant_id', tenant.id).in('sender_id', [cleanPhone, leadPhone, msg.fromPhone]).order('created_at', { ascending: true }),
  ]);

  const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
  let sessionExpired = false;
  // Canonical = oldest thread for this contact (carries the merged history). One
  // contact = one conversation thread forever (exactly like WhatsApp / Intercom).
  const canonicalConv: Record<string, any> | null =
    existingConvs && existingConvs.length > 0 ? existingConvs[0] : null;

  if (canonicalConv) {
    // Session-expiry flag only controls welcome re-send logic; it NO LONGER spawns a
    // new conversation. The 24h WhatsApp window is enforced at send time, not here.
    if (canonicalConv.last_message_at) {
      const idleMs = Date.now() - new Date(canonicalConv.last_message_at as string).getTime();
      if (idleMs > SESSION_EXPIRY_MS) sessionExpired = true;
    }

    // Consolidate any stray duplicate threads for this contact into the canonical one
    // BEFORE we (re)activate it — this keeps the unique partial index
    // (tenant_id, sender_id) WHERE is_active=true satisfied and guarantees the canonical
    // thread owns every message.
    const dupeIds = (existingConvs ?? [])
      .filter((c: Record<string, any>) => c.id !== canonicalConv.id)
      .map((c: Record<string, any>) => c.id);
    if (dupeIds.length > 0) {
      // Reassign any messages off the duplicates FIRST so none are orphaned, then
      // deactivate the duplicates (preserve audit trail — never delete).
      await supabaseAdmin.from('messages').update({ conversation_id: canonicalConv.id }).in('conversation_id', dupeIds);
      await supabaseAdmin.from('conversations').update({ is_active: false }).in('id', dupeIds);
    }

    // Reactivate the canonical thread if the cron (or a prior session expiry) put it to
    // sleep. Awaited: a dropped write would leave new inbound messages orphaned again.
    if (!canonicalConv.is_active) {
      await supabaseAdmin.from('conversations').update({ is_active: true }).eq('id', canonicalConv.id);
      canonicalConv.is_active = true;
      console.log(`⏰ Reactivated canonical conversation ${canonicalConv.id} for ${cleanPhone}${sessionExpired ? ' (session was expired)' : ''}`);
    }
  }
  // Always use the canonical conversation — NEVER null it out.
  const activeExistingConv = canonicalConv;

  if (existingLead) {
    lead = existingLead;
    const updateData: Record<string, any> = { last_message_at: new Date().toISOString() };
    if (isFromAd && !existingLead.source_detail) updateData.source_detail = leadSource;
    // Awaited — fire-and-forget dies on serverless freeze, leaving CRM timestamps stale
    await supabaseAdmin.from('leads').update(updateData).eq('id', existingLead.id);
    // Cancel any pending follow-ups — they will be re-scheduled below (either in
    // the scripted-reply block or Step 18) with a fresh timer from THIS message.
    // This means the 30-min clock resets with every message the lead sends, so
    // if they go silent mid-conversation they still get a follow-up.
    cancelLeadFollowUps(existingLead.id).catch(() => {});
    cancelLeadAutomations(existingLead.id).catch(() => {});
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
        const defaultAssigneeId = (tenant as any).default_lead_assignee_id;
        const defaultMember = defaultAssigneeId ? teamMembers.find(m => m.id === defaultAssigneeId) : null;

        if (defaultMember) {
          assignedMember = defaultMember;
          assignedTo = defaultMember.id;
          console.log(`👤 Assigned lead to default assignee: ${assignedMember.full_name || assignedMember.email}`);
        } else {
          const salesPool = teamMembers.filter((m) => m.is_sales_agent);
          const pool = salesPool.length > 0 ? salesPool : teamMembers;
          const counter = (tenant.lead_assignment_counter as number) ?? 0;
          const idx = counter % pool.length;
          assignedMember = pool[idx];
          assignedTo = pool[idx].id;
          // Awaited: if the counter write dies, round-robin sticks on one agent
          await supabaseAdmin
            .from('tenants')
            .update({ lead_assignment_counter: counter + 1 })
            .eq('id', tenant.id);
        }
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
          phone: leadPhone, // always store with + prefix for consistency
          channel: 'whatsapp',
          lead_status: 'new',
          lead_score: 0,
          source_detail: leadSource,
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

    // ignoreDuplicates: true silently swallows ON CONFLICT rows and returns null.
    // This happens when the DB normalises the phone (e.g. adds "+") and the row
    // already exists under a slightly different format. Recover by re-fetching.
    if (!newLead) {
      const { data: retryLead } = await supabaseAdmin
        .from('leads').select('*')
        .eq('tenant_id', tenant.id)
        .in('phone', [leadPhone, cleanPhone])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (retryLead) {
        lead = retryLead;
        console.log(`🔄 Lead re-fetched after upsert conflict: ${retryLead.id} (phone ${retryLead.phone})`);
      }
    }

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

      triggerAutomations({
        tenantId: tenant.id, event: 'new_lead', leadId: newLead.id,
        phone: cleanPhone,
        variables: { customer_name: newLead.name || 'there', business_name: tenant.business_name || '' },
      }).catch(e => console.error('Automations (new_lead):', e.message));

      appendLeadRow(tenant.id, {
        name: newLead.name || undefined,
        phone: cleanPhone,
        email: newLead.email || undefined,
        lead_status: 'new',
        source: leadSource,
        campaign: campaignName,
        lead_score: 0,
        created_at: new Date().toISOString(),
      }).catch(e => console.error('⚠️ Sheets append failed (non-fatal):', (e as Error).message));

      if (isFromAd) {
        triggerCapiEvent('Lead', { tenantId: tenant.id, leadId: newLead.id })
          .catch(e => console.error('⚠️ CAPI trigger failed (CTWA lead):', e.message));
      }

      if (isFromAd && assignedMember?.email) {
        const customTemplate = (tenant as any).lead_assigned_email_template;
        sendLeadAssignedEmail(
          assignedMember.email,
          newLead.name || cleanPhone,
          (tenant.business_name as string) || 'your business',
          'Meta Ad',
          customTemplate
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
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), is_active: true })
      .eq('id', activeExistingConv.id);
  } else {
    // No existing conversation found for this contact — create one.
    // Use ON CONFLICT to handle the race condition where two concurrent webhooks
    // from the same contact both try to create a new conversation simultaneously.
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
      // Unique constraint violation (23505) or other error — fetch the canonical row.
      // This handles the race-condition where a parallel webhook created it first.
      const { data: reFetched } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('tenant_id', tenant.id)
        .in('sender_id', [cleanPhone, leadPhone])
        .eq('is_active', true)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      conversation = reFetched;
    } else {
      conversation = newConv;

      // Safety net: if parallel inserts somehow created two active conversations
      // (before the unique partial index is applied), consolidate them.
      // Unlike the old code, we REASSIGN messages before deactivating duplicates.
      const { data: allActive } = await supabaseAdmin
        .from('conversations')
        .select('id, created_at')
        .eq('tenant_id', tenant.id)
        .in('sender_id', [cleanPhone, leadPhone])
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (allActive && allActive.length > 1) {
        const keepId = allActive[0].id; // oldest conversation wins
        const dupeIds = allActive.slice(1).map(c => c.id);
        // Reassign messages BEFORE deactivating to prevent orphaned messages
        await supabaseAdmin.from('messages').update({ conversation_id: keepId }).in('conversation_id', dupeIds);
        // Deactivate duplicates (not delete — preserves audit trail)
        await supabaseAdmin.from('conversations').update({ is_active: false }).in('id', dupeIds);
        if (newConv && newConv.id !== keepId) {
          const { data: canonical } = await supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('id', keepId)
            .single();
          conversation = canonical;
        }
        console.log(`🔧 Consolidated ${dupeIds.length} duplicate conversation(s) for ${cleanPhone} → kept ${keepId}`);
      }
    }
  }

  if (!conversation) {
    console.error('❌ Meta Webhook: failed to resolve conversation');
    return;
  }

  // Self-heal: if conversation.lead_id is null but we now have a lead (can happen
  // when leads were previously unlinked due to the source_detail column bug), patch it.
  if (lead && !conversation.lead_id) {
    supabaseAdmin.from('conversations').update({ lead_id: lead.id }).eq('id', conversation.id).then(
      () => { conversation!.lead_id = lead!.id; },
      () => {},
    );
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
  const inboundMetadata = (msg.type === 'interactive' || msg.type === 'button' || msg.contextMessageId)
    ? {
        ...(msg.buttonId ? { selected_button_id: msg.buttonId } : {}),
        ...(msg.contextMessageId ? { reply_to_wa_message_id: msg.contextMessageId } : {}),
      } : undefined;
  const inboundMsgPayload = {
    tenant_id: tenant.id,
    conversation_id: conversation.id,
    direction: 'inbound' as const,
    content,
    message_type: isMedia ? msg.type : (msg.type === 'interactive' || msg.type === 'button') ? 'interactive' : 'text',
    channel: 'whatsapp',
    sender_id: cleanPhone,
    status: 'delivered',
    ai_generated: false,
    wa_message_id: msg.messageId,
    ...(inboundMetadata && { metadata: inboundMetadata }),
    ...(msg.rawWebhook && { raw_webhook: msg.rawWebhook }),
    ...(isMedia && {
      media_url: resolvedMediaUrl || content || null,
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

  // Bump last_message_at so the inbox re-sorts. Awaited — `void` fire-and-forget
  // dies when the serverless function freezes, leaving the sidebar stale.
  // NOTE: message_count is NO LONGER incremented here. It is maintained by the
  // trg_sync_conv_message_count DB trigger (20260616_chat_realtime_and_count_trigger.sql)
  // so EVERY write path (AI replies, follow-ups, manual sends, reassignment) stays
  // accurate. Incrementing here too would double-count inbound messages.
  await supabaseAdmin
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
  // ONLY true WhatsApp compliance keywords. Conversational words ('yes', 'cancel',
  // 'end', 'quit', 'join') were hijacking normal replies — e.g. answering "Yes" to
  // "Want a walkthrough?" was treated as a resubscribe command and the AI never ran;
  // a customer saying "cancel" (a booking) was being unsubscribed.
  const STOP_KEYWORDS  = ['stop', 'unsubscribe', 'opt out', 'optout', 'remove me', 'band karo', 'rokdo', 'nahi chahiye', 'hatao', 'ruk jao'];
  const START_KEYWORDS = ['start', 'subscribe', 'opt in', 'optin', 'resume', 'shuru karo', 'chalu karo'];

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
  // Stickers carry no actionable text — store + skip AI silently (no reply needed).
  if (msg.type === 'sticker') {
    console.log(`⏭️ Meta: skipping AI for sticker from ${cleanPhone}`);
    return;
  }

  // Unsupported = Meta couldn't deliver the message's contents to us. The customer
  // DID send something we can't read, so we must NOT silently ignore them (that was
  // the "messages being lost" bug). We: (1) log + alert with Meta's real reason so
  // the cause is diagnosable, (2) flag the chat for a human, and (3) auto-reply ONCE
  // per conversation so the customer isn't ghosted while staying un-spammed on repeats.
  if (msg.type === 'unsupported') {
    const reason = msg.errorReason || 'unknown';
    console.warn(`⚠️ Meta: unsupported message from ${cleanPhone} (code=${msg.errorCode ?? 'n/a'}): ${reason}`);

    notifyAdmin({
      dedupeKey: `unsupported:${tenant.id}:${cleanPhone}`,
      subject: `Unreadable WhatsApp message — ${tenant.business_name}`,
      summary: `WhatsApp delivered an "unsupported" message from ${cleanPhone} that we could not read. Meta code=${msg.errorCode ?? 'n/a'}: ${reason}`,
      context: { tenantId: tenant.id, from: cleanPhone, wamid: msg.messageId, errorCode: msg.errorCode, errorReason: reason },
    }).catch(() => {});

    // Flag for a human so the chat surfaces in the inbox (don't clobber an existing
    // escalation or a hard human-takeover).
    if (!conversation.escalated && !conversation.bot_paused) {
      await supabaseAdmin
        .from('conversations')
        .update({ escalated: true, escalated_at: new Date().toISOString(), escalation_reason: 'unreadable_message' })
        .eq('id', conversation.id);
    }

    // Auto-reply at most once per 6h (Redis SET NX; DB fallback checks for a recent
    // non-AI outbound so a Redis outage can't turn this into a reply storm).
    const noticeLock = await acquireOnceNotice(`unreadable:${conversation.id}`);
    let alreadyNotified = noticeLock === 'already_sent';
    if (noticeLock === 'use_db_fallback') {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('conversation_id', conversation.id)
        .eq('direction', 'outbound')
        .eq('ai_generated', false)
        .gte('created_at', sixHoursAgo)
        .limit(1)
        .maybeSingle();
      alreadyNotified = !!recent;
    }

    if (!alreadyNotified && decryptedAccessToken && tenant.wa_phone_number_id) {
      const fallbackMsg =
        "Sorry, I couldn't read your last message 🙏 Could you please resend it as plain text? One of our team members will assist you shortly.";
      await sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, fallbackMsg).catch(() => {});
      await supabaseAdmin.from('messages').insert({
        tenant_id: tenant.id, conversation_id: conversation.id,
        direction: 'outbound', content: fallbackMsg,
        message_type: 'text', channel: 'whatsapp',
        status: 'sent', ai_generated: false,
      });
      console.log(`📨 Sent unreadable-message fallback to ${cleanPhone} and escalated for human`);
    }
    return;
  }

  // Staff/manager phone detection — skip customer AI, send a meaningful staff reply.
  // This also opens the Meta 24-hour window so booking alerts can be delivered to them.
  const normStaff   = (tenant.staff_phone   || '').replace(/\D/g, '');
  const normManager = (tenant.manager_phone || '').replace(/\D/g, '');
  if (cleanPhone && (cleanPhone === normStaff || cleanPhone === normManager)) {
    if (decryptedAccessToken && tenant.wa_phone_number_id) {
      const businessName = (tenant as any).business_name || 'your business';
      const staffReply =
        `👋 Hi! You're connected to the *${businessName}* staff portal.\n\n` +
        `🔔 *Booking alerts are active* — you'll receive a WhatsApp message here every time a customer confirms a reservation.\n\n` +
        `You're all set! No action needed. 🎉`;
      sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, staffReply)
        .catch(e => console.error('[staff-detect] reply failed:', (e as Error).message));
    }
    return;
  }

  // bot_paused = hard stop (human agent has taken over — never override)
  if (conversation.bot_paused) {
    console.log(`🔇 Meta: bot paused (human takeover) for conversation ${conversation.id}, skipping AI`);
    return;
  }

  // escalated = soft state — resolve via booking completion OR timeout, else pause bot
  if (conversation.escalated) {
    const ctx = (conversation.context as Record<string, any>) || {};
    if (ctx.booking_saved) {
      // Booking completed — auto-clear so bot handles follow-up
      console.log(`🔄 Auto-clearing escalation for conversation ${conversation.id} (booking already saved)`);
      await supabaseAdmin
        .from('conversations')
        .update({ escalated: false, escalation_reason: null })
        .eq('id', conversation.id);
      conversation.escalated = false;
      // H1: auto-resolve must fire escalation_resolved automations too, not just
      // the manual dashboard "resolve" button.
      triggerAutomations({
        tenantId: tenant.id, event: 'escalation_resolved', leadId: lead?.id,
        conversationId: conversation.id, phone: cleanPhone,
        variables: { customer_name: lead?.name || 'there', business_name: tenant.business_name || '' },
      }).catch(e => console.error('Automations (escalation_resolved):', e.message));
    } else if (conversation.escalated_at) {
      // Real-time timeout check — don't wait for the daily cron
      const timeoutMs = (tenant.escalation_timeout_mins || 30) * 60 * 1000;
      const escalatedAt = new Date(conversation.escalated_at).getTime();
      if (Date.now() - escalatedAt >= timeoutMs) {
        console.log(`⏱️ Escalation timed out for conversation ${conversation.id} — resuming bot`);
        await supabaseAdmin
          .from('conversations')
          .update({ escalated: false, escalation_reason: null })
          .eq('id', conversation.id);
        conversation.escalated = false;
        // H1: timeout auto-resolve also fires escalation_resolved automations.
        triggerAutomations({
          tenantId: tenant.id, event: 'escalation_resolved', leadId: lead?.id,
          conversationId: conversation.id, phone: cleanPhone,
          variables: { customer_name: lead?.name || 'there', business_name: tenant.business_name || '' },
        }).catch(e => console.error('Automations (escalation_resolved):', e.message));
      } else {
        // Still within timeout window — bot paused, human should handle.
        // Send a brief "hold on" acknowledgment so the customer isn't left in silence.
        // Rate-limited to one per 5 minutes per conversation via Redis.
        console.log(`🔇 Meta: conversation ${conversation.id} escalated (${Math.round((Date.now() - escalatedAt) / 60000)}/${tenant.escalation_timeout_mins || 30} mins), skipping AI`);
        if (decryptedAccessToken && tenant.wa_phone_number_id) {
          const redis = getRedisClient();
          let shouldAck = true;
          if (redis) {
            try {
              const claimed = await redis.set(`esc-ack:${conversation.id}`, '1', 'EX', 300, 'NX');
              if (!claimed) shouldAck = false;
            } catch {}
          }
          if (shouldAck) {
            const staffLabel = tenant.staff_name || 'our team';
            sendTextMessage(
              decryptedAccessToken,
              tenant.wa_phone_number_id as string,
              cleanPhone,
              `${staffLabel} has been notified and will get back to you shortly. Please hold on! 🙏`
            ).catch(() => {});
          }
        }
        return;
      }
    } else {
      // No escalated_at timestamp — treat as timed out (data issue)
      console.log(`🔇 Meta: conversation ${conversation.id} escalated (no timestamp), skipping AI`);
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

  // ── Scripted Replies early check ────────────────────────────────────────────
  // Must run BEFORE the off-hours guard so scripted replies (e.g. welcome image
  // on "hi") always fire even when the business is closed. Longest-keyword-match
  // wins so more specific keywords beat broad single words.
  if (msg.text) {
    const { data: earlyScriptedRows } = await supabaseAdmin
      .from('scripted_replies')
      .select('keywords, reply, media_url')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true);

    if (earlyScriptedRows && earlyScriptedRows.length > 0) {
      type ESRow = { keywords: string[]; reply: string; media_url?: string | null };
      // Matching rules (short-keyword start anchor, longest-keyword-wins) live
      // in @/lib/webhook/decisions — unit-tested in tests/webhook-decisions.test.ts
      const matchedEarly = pickScriptedReply(earlyScriptedRows as ESRow[], msg.text);
      if (matchedEarly) {
        console.log(`⚡ Scripted reply (early) matched for tenant ${tenant.id}: "${matchedEarly.keywords.join(', ')}"`);
        if (decryptedAccessToken && tenant.wa_phone_number_id) {
          const srMediaType = matchedEarly.media_url ? mediaTypeFromUrl(matchedEarly.media_url) : null;
          const srMediaUrl = matchedEarly.media_url ? await toSignedMediaUrl(matchedEarly.media_url) : null;
          const sendResult = srMediaUrl
            ? await sendMediaMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, srMediaType!, srMediaUrl, matchedEarly.reply || undefined)
                .catch((e: Error) => { console.error(`❌ Scripted reply ${srMediaType} send failed:`, e.message); return null; })
            : await sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, matchedEarly.reply)
                .catch((e: Error) => { console.error('❌ Scripted reply send failed:', e.message); return null; });
          const { error: scriptedMsgErr } = await supabaseAdmin.from('messages').insert({
            tenant_id: tenant.id, conversation_id: conversation.id,
            direction: 'outbound',
            content: matchedEarly.reply || matchedEarly.media_url || '',
            message_type: srMediaType ?? 'text',
            channel: 'whatsapp', status: sendResult ? 'sent' : 'failed',
            ai_generated: false, wa_message_id: sendResult?.messageId ?? null,
            ...(matchedEarly.media_url && {
              media_url: matchedEarly.media_url,
              media_caption: matchedEarly.reply || null,
            }),
          });
          if (scriptedMsgErr) {
            console.error('❌ Scripted reply message insert failed:', scriptedMsgErr.message);
          }
        }
        // Scripted reply exits before step 18, so schedule follow-ups here.
        // Run for EVERY scripted reply (not just first message) so the 30-min
        // timer resets whenever the lead re-engages. Awaited — fire-and-forget
        // is unreliable on serverless.
        if (lead?.id) {
          const _srNow = Date.now();
          const _srFuConfigs = [
            { enabled: !!tenant.followup_30min, type: '30min',  delayMs: 30 * 60 * 1000 },
            { enabled: !!tenant.followup_3hr,   type: '3hr',    delayMs: 3 * 60 * 60 * 1000 },
            { enabled: !!tenant.followup_24hr,  type: '24hr',   delayMs: 24 * 60 * 60 * 1000 },
            { enabled: !!tenant.followup_7day,  type: '7day',   delayMs: 7 * 24 * 60 * 60 * 1000 },
          ];
          const _srFuRows = _srFuConfigs.filter(c => c.enabled).map(c => ({
            id: randomUUID(),
            tenant_id: tenant.id,
            lead_id: lead!.id,
            conversation_id: conversation?.id ?? null,
            follow_up_type: c.type,
            scheduled_at: new Date(_srNow + c.delayMs).toISOString(),
            message: null,
            ai_generated: true,
            status: 'pending',
          }));
          if (_srFuRows.length > 0) {
            try {
              await supabaseAdmin.from('follow_ups')
                .upsert(_srFuRows, { onConflict: 'id', ignoreDuplicates: true });
              console.log(`⚡⏰ ${_srFuRows.length} follow-up(s) scheduled after scripted reply for lead ${lead!.id}`);
            } catch (fuErr: any) {
              console.error('⚡⏰ Failed to schedule follow-ups after scripted reply:', fuErr?.message || fuErr);
            }
          } else {
            console.log(`⚡⏰ No follow-ups enabled for tenant ${tenant.id} — skipping`);
          }
        }
        return;
      }
    }
  }

  // Off-hours guard: send ONE notice per 6-hour closed window per conversation.
  // Race-safe: acquireOffHoursLock uses Redis SET NX (atomic) — only the FIRST
  // concurrent request can acquire the lock; all others see 'already_sent'.
  //
  // Only fires when the tenant has explicitly enabled the off-hours auto-reply
  // (off_hours_enabled). Without that flag the assistant answers 24/7 — there is
  // no longer any "silent" off-hours behavior driven purely by working_hours.
  // A human-handoff request ("talk to a human", "book a demo with the team") is
  // NEVER swallowed by the closed notice — it falls through to the AI + escalation
  // path so staff still get notified even outside business hours.
  if (
    tenant.off_hours_enabled &&
    isBusinessOpen === false &&
    businessHoursStr &&
    !isHumanHandoffRequest(msg.text)
  ) {
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

  // isFirstMessage = brand-new contact OR returning after a 24h idle gap (session
  // expired). Both cases re-send the welcome message. sessionExpired was previously
  // calculated but never wired into this flag, so returning customers always fell
  // through to the "ongoing conversation" path and got a generic AI reply instead
  // of their configured welcome message.
  // Race-condition guard: when a user sends multiple messages rapidly, several
  // concurrent webhook calls may all see activeExistingConv === null (the first
  // call's conversation insert hasn't committed yet). Without a gate, ALL of them
  // would fire the welcome message/flow. We use Redis SET NX to let exactly ONE
  // concurrent call claim "first message" ownership — the rest proceed as non-first.
  let isFirstMessage = activeExistingConv === null || sessionExpired;
  // Redis dedup only for truly new contacts: concurrent bursts from the same new
  // sender can all see activeExistingConv===null before the first insert commits.
  // Session-expired returning customers are a single sequential message — no burst.
  if (isFirstMessage && activeExistingConv === null) {
    const redis = getRedisClient();
    if (redis) {
      try {
        const claimed = await redis.set(
          `welcome:${tenant.id}:${cleanPhone}`,
          '1',
          'EX', 120,
          'NX'
        );
        if (!claimed) {
          isFirstMessage = false;
          console.log(`🔒 Welcome dedup: another call already claimed first-message for ${cleanPhone}`);
        }
      } catch {}
    }
  }

  // 12+13. Fire the AI-context batch speculatively BEFORE the flow engine so its
  // DB time (~200-300ms) overlaps with the flow engine's own DB check (~50-150ms).
  // All 7 queries are pure reads — no side effects. If flows handle the message
  // the results are simply discarded; otherwise they're ready (or very close) when
  // the AI needs them, saving ~100-150ms on every non-flow message.
  const _aiBatchPromise = Promise.all([
    supabaseAdmin
      .from('messages')
      .select('direction, content, ai_generated')
      .eq('conversation_id', conversation.id)
      // Defence-in-depth: also filter by tenant_id so a race-condition that assigns
      // a conversation to the wrong tenant never bleeds another tenant's history into
      // this AI context. The admin client bypasses RLS so we enforce it explicitly.
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(20),
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
    // Fetch sendable media files (videos, images, PDFs with file_url)
    supabaseAdmin
      .from('knowledge_docs')
      .select('filename, file_type, file_url')
      .eq('tenant_id', tenant.id)
      .not('file_url', 'is', null)
      .limit(20),
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
      msg.buttonId,    // raw button reply id from Meta
      msg.referral     // Meta ad referral (undefined when not from a CTWA ad)
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
  const [{ data: recentMsgs }, { data: smartRulesRows }, { data: agentRows }, { data: existingBookingRow }, { data: kbDocs }, { data: kbEmbedCheck }, { data: kbMediaFiles }] = await _aiBatchPromise;

  const history = (recentMsgs || [])
    .reverse()
    .slice(0, -1) // Exclude current message
    .map(m => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.content,
      ai_generated: m.ai_generated,
    }));

  // True if the bot has NEVER sent an AI reply in this conversation.
  // Off-hours notices are outbound but NOT ai_generated — they must not count
  // as "already greeted". A customer who got only an off-hours notice should
  // still receive the configured welcome message on their next message.
  const hasAIReplies = (recentMsgs || []).some(
    m => m.direction === 'outbound' && m.ai_generated
  );

  const wasRecentlyHandedOff = !!conversation.handoff_assigned_at &&
    (Date.now() - new Date(conversation.handoff_assigned_at as string).getTime()) < SESSION_EXPIRY_MS;
  const hasSubstantialHistory = storedMsgCount > 3;

  // Definitive 24h guard: if ANY message was exchanged within 24 hours, this is
  // NOT a first contact — never re-greet. This is more reliable than message_count
  // (requires a DB trigger) or hasAIReplies (only checks last 20 messages).
  const lastMsgAt = conversation.last_message_at as string | null;
  const hasRecentActivity = !!lastMsgAt &&
    (Date.now() - new Date(lastMsgAt).getTime()) < SESSION_EXPIRY_MS;

  let isFirstMessageForAI = (
    !hasAIReplies && !wasRecentlyHandedOff && !hasSubstantialHistory && !hasRecentActivity
  ) || (sessionExpired && !wasRecentlyHandedOff);
  if (isFirstMessageForAI && !isFirstMessage) {
    const redis = getRedisClient();
    if (redis) {
      try {
        const welcomeSent = await redis.get(`welcome:${tenant.id}:${cleanPhone}`);
        if (welcomeSent) isFirstMessageForAI = false;
      } catch {}
    }
  }

  perf('parallel_fetch_done');

  // ── P0: per-sender flood protection + AI cost ceiling ──────────────────────
  // Bound runaway Gemini spend and webhook abuse BEFORE any expensive work
  // (RAG embedding, typing indicator, model call). Both checks fail OPEN when
  // Redis is unavailable so a cache outage never blocks real customer traffic.
  const floodCheck = await checkSenderRateLimit(cleanPhone);
  if (!floodCheck.allowed) {
    // Sustained flood from one sender — drop silently (no AI, no outbound) to
    // avoid amplifying cost and tripping Meta's own per-number rate limits.
    console.warn(`⏱️ Rate-limited inbound from ${cleanPhone} (tenant ${tenant.id}) — dropping`);
    return;
  }

  const plan = (tenant.plan as string) || 'starter';
  const [dailyOk, monthly] = await Promise.all([
    checkDailyAICostLimit(tenant.id, plan),
    checkAICostLimit(tenant.id, plan),
  ]);
  if (!dailyOk || !monthly.allowed) {
    // Tenant has hit their plan's AI usage cap — reply gracefully without
    // calling Gemini so they stop burning tokens past the limit.
    console.warn(`💰 AI cost cap reached: tenant=${tenant.id} plan=${plan} used=${monthly.usedTokens}/${monthly.limitTokens} daily_ok=${dailyOk}`);
    if (decryptedAccessToken && tenant.wa_phone_number_id) {
      await sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, cleanPhone, AI_FALLBACK_MESSAGE).catch(() => {});
    }
    return;
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
      agent.routing_keywords.some((kw: string) => kwWordMatch(lowerMsgText, kw))
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
    mediaFiles: ((kbMediaFiles || []) as Array<{ filename: string; file_type: string; file_url: string }>)
      .map(f => ({ filename: f.filename, file_type: f.file_type })),
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
    // Post-handoff context: tell the AI that a human agent was just handling
    // this conversation so it continues naturally instead of restarting.
    resumingFromHandoff: wasRecentlyHandedOff && !isFirstMessageForAI,
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

  // 13b. Increment AI conversation counter. AWAITED — this counter feeds the
  // AI cost cap (ai_conversations_this_month vs ai_conversation_limit). A
  // fire-and-forget write that dies on serverless freeze undercounts usage
  // and lets tenants blow past their AI budget.
  await supabaseAdmin.rpc('increment_ai_conversations', { p_tenant_id: tenant.id });

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

  // 14b. Custom keyword escalation override — runs after AI so existing shouldEscalate=true is preserved.
  // If the message contains a tenant-defined keyword and AI didn't already escalate, force it now.
  const customEscKeywords: string[] = tenant.escalation_keywords || [];
  if (
    customEscKeywords.length > 0 &&
    !aiResponse.shouldEscalate &&
    customEscKeywords.some((kw) => kw.trim() && kwWordMatch(msg.text?.toLowerCase() || '', kw))
  ) {
    aiResponse.shouldEscalate = true;
    aiResponse.escalationReason = 'keyword_match';
  }

  // 14c. Built-in human-handoff safety net — independent of the AI model AND of
  // tenant-configured keywords. Guarantees explicit "talk to a human" / "book a
  // demo with the team" requests escalate even if the model misread the intent
  // (e.g. answered with a sales pitch). This is the deterministic backstop the
  // main reply path was previously missing — it only existed in the provider-down
  // fallback, so it never fired while Gemini was healthy.
  if (!aiResponse.shouldEscalate && isHumanHandoffRequest(msg.text)) {
    aiResponse.shouldEscalate = true;
    aiResponse.escalationReason = 'human_request';
  }

  // Apply the escalation reply. A tenant's custom reply always wins; otherwise,
  // when WE forced the escalation (keyword / human request), replace whatever the
  // AI said (which may be an off-topic pitch) with a clean handoff line so the
  // customer isn't sold to when they asked for a person.
  if (aiResponse.shouldEscalate) {
    if (tenant.escalation_reply?.trim()) {
      aiResponse.reply = tenant.escalation_reply.trim();
    } else if (aiResponse.escalationReason === 'human_request' || aiResponse.escalationReason === 'keyword_match') {
      aiResponse.reply = `I'm connecting you with ${tenant.staff_name || 'our team'} right away 🙏 They'll be with you shortly.`;
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
      // On first contact: send welcome media + text as ONE message (media with caption)
      // so WhatsApp delivers them atomically — no ordering race between two requests.
      // Supports images, videos, and documents stored in welcome_image_url.
      if (isFirstMessageForAI && tenantConfig.welcomeImageUrl) {
        const welcomeMediaType = mediaTypeFromUrl(tenantConfig.welcomeImageUrl);
        const welcomeSignedUrl = await toSignedMediaUrl(tenantConfig.welcomeImageUrl);
        let mediaSent = false;
        await sendMediaMessage(
          decryptedAccessToken,
          tenant.wa_phone_number_id,
          cleanPhone,
          welcomeMediaType,
          welcomeSignedUrl,
          // Videos/documents don't support captions on WhatsApp — send text separately
          welcomeMediaType === 'image' ? aiResponse.reply : undefined
        ).then(() => { mediaSent = true; }).catch(mediaErr => {
          console.error(`⚠️ Meta: welcome ${welcomeMediaType} send failed, falling back to text only:`, (mediaErr as Error).message);
        });
        // For images: caption delivered with media — skip standalone text.
        // For video/document: caption not supported, fall through to send text too.
        if (mediaSent && welcomeMediaType === 'image') metaMsgId = 'welcome-image-with-caption';
      }

      if (!metaMsgId) {
        const result = await sendTextMessage(
          decryptedAccessToken,
          tenant.wa_phone_number_id,
          cleanPhone,
          aiResponse.reply
        );
        metaMsgId = result.messageId;
      }
    } catch (sendErr) {
      sendFailureMsg = (sendErr as Error).message;
      console.error('❌ Meta: failed to send AI reply:', sendFailureMsg);
      Sentry.captureException(sendErr);
    }

    // 15b. Send media attachment if AI requested one
    const mediaFilename = aiResponse.extractedData?.mediaToSend;
    if (mediaFilename && decryptedAccessToken && tenant.wa_phone_number_id) {
      const matchedMedia = ((kbMediaFiles || []) as Array<{ filename: string; file_type: string; file_url: string }>)
        .find(f => f.filename === mediaFilename);
      if (matchedMedia?.file_url) {
        try {
          const mediaUrl = await toSignedMediaUrl(matchedMedia.file_url);
          if (mediaUrl) {
            const mType = mediaTypeFromUrl(matchedMedia.filename);
            const mediaResult = await sendMediaMessage(
              decryptedAccessToken,
              tenant.wa_phone_number_id,
              cleanPhone,
              mType,
              mediaUrl,
              mType === 'document' ? matchedMedia.filename : undefined
            );
            // Store the media message in DB so it appears in the dashboard chat
            const { error: mediaInsertErr } = await supabaseAdmin.from('messages').insert({
              tenant_id: tenant.id,
              conversation_id: conversation.id,
              direction: 'outbound',
              content: matchedMedia.filename,
              message_type: mType,
              channel: 'whatsapp',
              status: 'sent',
              ai_generated: true,
              media_url: mediaUrl,
              file_name: matchedMedia.filename,
              mime_type: mType === 'video' ? 'video/mp4' : mType === 'document' ? 'application/pdf' : 'image/jpeg',
              wa_message_id: mediaResult.messageId,
            });
            if (mediaInsertErr) console.error('Failed to store media message:', mediaInsertErr);
            console.log(`✅ Sent media attachment "${matchedMedia.filename}" to ${cleanPhone}`);
          }
        } catch (mediaErr) {
          console.error(`⚠️ Failed to send media "${mediaFilename}":`, (mediaErr as Error).message);
        }
      }
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

  // 17b. Notify staff on WhatsApp when AI decides to escalate this conversation.
  // Uses the tenant's own custom alert template (set in Settings → Staff & Alerts).
  // Falls back to the platform default if not configured.
  // Fully multi-tenant: each client's staff only receives their own alerts,
  // sent from their own WhatsApp number using their own token. Safe for 1500+ tenants.
  if (aiResponse.shouldEscalate && tenant.escalation_enabled !== false) {
    const leadName = lead?.name || cleanPhone;
    const reason   = aiResponse.escalationReason || 'Customer requested human assistance';
    const preview  = msg.text ? msg.text.slice(0, 200) : '[media message]';

    // Per-tenant template with variable interpolation.
    // Variables: {{customer_name}} {{customer_phone}} {{reason}} {{message}} {{business_name}}
    const DEFAULT_ESCALATION_TEMPLATE =
      `🚨 Escalation Alert — {{business_name}}\n\n` +
      `Customer: {{customer_name}}\n` +
      `Phone: +{{customer_phone}}\n` +
      `Reason: {{reason}}\n` +
      `Message: {{message}}\n\n` +
      `👉 Reply via Live Chat: https://ariesai.in/dashboard/chat\n` +
      `(Bot is now paused for this customer — resume it from Live Chat when done)`;

    const templateVars: Record<string, string> = {
      customer_name:  leadName,
      customer_phone: cleanPhone,
      reason,
      message:        preview,
      business_name:  tenant.business_name || 'Your Business',
    };

    const rawTemplate = tenant.escalation_alert_template?.trim() || DEFAULT_ESCALATION_TEMPLATE;
    const alertMsg = rawTemplate.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => templateVars[key] ?? '');

    const alertResults = await sendStaffAlert(tenant, alertMsg);
    const alertFailures = alertResults.filter(r => !r.ok);
    if (alertFailures.length > 0) {
      notifyAdmin({
        dedupeKey: `staff-alert-fail:${tenant.id}`,
        subject: `Staff alert delivery failed — ${tenant.business_name || tenant.id}`,
        summary:
          `Escalation alert could not be delivered to: ${alertFailures.map(f => f.phone).join(', ')}. ` +
          `Customer ${leadName} (+${cleanPhone}) triggered escalation but staff may not have been notified.`,
        context: {
          tenantId: tenant.id,
          businessName: tenant.business_name,
          failedPhones: alertFailures.map(f => f.phone),
          errors: alertFailures.map(f => f.error),
        },
      }).catch(() => {});
    }
    console.log(`🚨 [${tenant.business_name}] Escalation fired for ${leadName} — delivered: ${alertResults.filter(r => r.ok).length}/${alertResults.length}`);

    triggerAutomations({
      tenantId: tenant.id, event: 'escalation_triggered', leadId: lead?.id,
      conversationId: conversation.id, phone: cleanPhone,
      variables: { customer_name: leadName, business_name: tenant.business_name || '' },
    }).catch(e => console.error('Automations (escalation_triggered):', e.message));
  }

  // 18. Schedule follow-ups — runs on every message, resetting the 30-min timer.
  // cancelLeadFollowUps (above, step 4) already cancelled the previous pending
  // rows, so this always represents "30 min from the lead's most recent message."
  if (lead?.id) {
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

  // 18b. Update Lead Score — cumulative, deterministic, explainable, industry-aware
  if (lead?.id) {
    try {
      // Resolve industry profile from business_profiles (non-blocking parallel fetch)
      const { data: bizProfile } = await supabaseAdmin
        .from('business_profiles')
        .select('industry')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      const industryProfile = normalizeIndustry(bizProfile?.industry);

      const scoringResult = calculateLeadScore({
        userMessage: msg.text,
        aiResponse,
        conversation: {
          message_count: conversation.message_count ?? 0,
          created_at:    conversation.created_at,
        },
        lead: {
          lead_score:       (lead.lead_score as number) ?? 0,
          lead_status:      lead.lead_status as string,
          manual_status:    (lead as any).manual_status ?? null,
          buying_signals:   (lead as any).buying_signals  ?? [],
          negative_signals: (lead as any).negative_signals ?? [],
        },
        industryProfile,
      });

      const hasScoreChange = scoringResult.score_delta !== 0;
      const hasStatusChange = scoringResult.status_changed;

      if (hasScoreChange || hasStatusChange) {
        await supabaseAdmin
          .from('leads')
          .update({
            lead_score:        scoringResult.lead_score,
            lead_status:       scoringResult.lead_status,
            auto_status:       scoringResult.auto_status,
            buying_signals:    scoringResult.all_buying_signals,
            negative_signals:  scoringResult.all_negative_signals,
            score_breakdown:   scoringResult.score_breakdown,
            scoring_reasoning: scoringResult.scoring_reasoning,
            last_activity_at:  new Date().toISOString(),
          })
          .eq('id', lead.id);

        console.log(`🎯 Lead ${lead.id} score: ${lead.lead_score}→${scoringResult.lead_score} (${scoringResult.lead_status}) delta=${scoringResult.score_delta} rule=${scoringResult.rule_score_delta} ai=${scoringResult.ai_score_delta} aiIgnored=${scoringResult.ai_ignored}`);

        // Log signal events (async, non-blocking)
        if (scoringResult.new_signals.length > 0) {
          logScoringEvents(
            tenant.id, lead.id, scoringResult, 'whatsapp',
            conversation.id, msg.messageId,
          ).catch(() => {});
        }

        // Log status transition
        if (hasStatusChange) {
          logStatusChange({
            tenantId:   tenant.id,
            leadId:     lead.id,
            fromStatus: scoringResult.prev_status,
            toStatus:   scoringResult.lead_status,
            trigger:    'scoring',
            reason:     scoringResult.scoring_reasoning.slice(0, 500),
          }).catch(() => {});
        }
      } else {
        // Always update last_activity_at even when score doesn't change
        supabaseAdmin
          .from('leads')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', lead.id)
          .then(() => {}, () => {});
      }
    } catch (err) {
      console.error('Lead scoring error (non-fatal):', err);
    }
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
        payment_amount: payAmount, // paise — Sheets renders as ₹
        created_at: new Date().toISOString(),
        special_request: contextObj.specialRequests || '',
      };

      // NOTE: Google Sheets sync moved to AFTER the booking is actually saved +
      // a table is assigned (see the success branch below). Writing it here meant
      // full-slot/aborted or failed bookings still created phantom Sheet rows.

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
      let assignedTableName: string | null = null; // captured for the staff alert

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

          const { data: newBooking, error: dbInsertErr } = await supabaseAdmin.from('restaurant_bookings').insert({
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
          }).select('id').single();
          if (dbInsertErr) {
            console.error('❌ AI Auto-Book DB save failed:', dbInsertErr.message);
          } else {
            bookingWritten = true;
            console.log(`   ✅ Saved to restaurant_bookings (ID: ${reservationId}, payment: ${payStatus}).`);

            // Auto-assign a physical table
            const slotTimeDisplay = slotTime.slice(0, 5);
            const { data: tableResult } = await supabaseAdmin.rpc('assign_best_table', {
              p_restaurant_id:    tenant.id,
              p_party_size:       guestCount,
              p_booking_id:       newBooking.id,
              p_guest_name:       customerName,
              p_guest_phone:      customerPhone,
              p_reservation_time: slotTimeDisplay,
              p_notes:            contextObj.specialRequests ? String(contextObj.specialRequests) : null,
              p_status:           'reserved',
            });
            const assignInfo = tableResult as { assigned: boolean; table_name?: string } | null;
            if (assignInfo?.assigned) {
              assignedTableName = assignInfo.table_name ?? null;
              console.log(`   🪑 Auto-assigned table ${assignInfo.table_name} for ${guestCount} guests`);
            } else {
              console.log(`   ⚠️ No available table for ${guestCount} guests — booking saved without table assignment`);
            }

            // Sync to Google Sheets ONLY now that the booking is persisted — and
            // include the assigned table. Non-blocking so the WhatsApp reply isn't delayed.
            appendBookingRow(tenant.id, { ...bookingPayload, table_name: assignInfo?.table_name })
              .then(() => console.log(`   ✅ Google Sheets booking row saved (table: ${assignInfo?.table_name ?? '—'}).`))
              .catch((sheetsErr: any) => console.error(`   ❌ Google Sheets booking save FAILED: ${sheetsErr.message}`));
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

      // Human-friendly date ("Sat, 28 Jun 2026") and 12-hour time ("7:30 PM")
      // Hoisted above both if-blocks so automationVars can also use them.
      const prettyDate = (() => {
        const d = new Date(`${bookingDate}T00:00:00`);
        return isNaN(d.getTime())
          ? bookingDate
          : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      })();
      const prettyTime = (() => {
        const [h, m] = slotTime.split(':');
        const hr = parseInt(h, 10);
        if (isNaN(hr)) return slotTime.slice(0, 5);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        const hr12 = hr % 12 === 0 ? 12 : hr % 12;
        return `${hr12}:${m} ${ampm}`;
      })();
      const guestLabel = `${guestCount} guest${guestCount !== 1 ? 's' : ''}`;
      const businessName = (tenant as any).business_name || 'us';

      // ── Notify staff + send the customer a clean confirmation (every booking) ──
      if (bookingWritten) {

        // 1. Staff/manager alert — fires for EVERY confirmed booking.
        const DEFAULT_BOOKING_ALERT_TEMPLATE =
          `🔔 *NEW BOOKING — {{business_name}}*\n\n` +
          `👤 {{customer_name}}\n` +
          `📞 {{customer_phone}}\n` +
          `👥 {{guest_count}}\n` +
          `📅 {{date}}\n` +
          `⏰ {{time}}\n` +
          `{{table}}` +
          `{{special_requests}}` +
          `🆔 {{reservation_id}}`;

        const bookingAlertVars: Record<string, string> = {
          customer_name:    customerName || 'Guest',
          customer_phone:   customerPhone,
          guest_count:      guestLabel,
          date:             prettyDate,
          time:             prettyTime,
          table:            assignedTableName ? `🪑 Table ${assignedTableName}\n` : '',
          special_requests: contextObj.specialRequests ? `📝 ${String(contextObj.specialRequests)}\n` : '',
          reservation_id:   reservationId,
          business_name:    (tenant as any).business_name || 'us',
        };

        const rawBookingTemplate = (tenant as any).booking_alert_template?.trim() || DEFAULT_BOOKING_ALERT_TEMPLATE;
        const staffAlert = rawBookingTemplate.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => bookingAlertVars[key] ?? '');
        sendStaffAlert(tenant, staffAlert)
          .then(r => console.log(`   📨 Staff booking alert sent (${r.filter(x => x.ok).length}/${r.length} delivered)`))
          .catch(e => console.error('   ❌ Staff booking alert failed:', (e as Error).message));

        // Email alert — reliable fallback (no Meta 24-hour window restriction)
        const staffEmail = (tenant as any).staff_email?.trim();
        if (staffEmail) {
          sendBookingAlertEmail({
            staffEmail,
            businessName:    (tenant as any).business_name || 'Your Business',
            customerName:    customerName || 'Guest',
            customerPhone,
            guestCount:      guestLabel,
            date:            prettyDate,
            time:            prettyTime,
            tableName:       assignedTableName,
            specialRequests: contextObj.specialRequests ? String(contextObj.specialRequests) : null,
            reservationId,
          }).catch(e => console.error('   ❌ Booking alert email failed:', (e as Error).message));
        }

        // 2. Customer confirmation card with the reservation ID. Prepaid bookings
        //    already receive the payment message with the ID, so only send this for
        //    free bookings to avoid duplicate messages.
        if (!isPrepaid && decryptedAccessToken && tenant.wa_phone_number_id) {
          const confirmCard =
            `✅ *Booking Confirmed!*\n\n` +
            `Thank you ${customerName}, we can't wait to host you at ${businessName}! 🎉\n\n` +
            `👥 ${guestLabel}\n` +
            `📅 ${prettyDate}\n` +
            `⏰ ${prettyTime}\n` +
            (assignedTableName ? `🪑 Table ${assignedTableName}\n` : '') +
            `🆔 Reservation ID: ${reservationId}\n\n` +
            `See you soon! ✨`;
          sendTextMessage(decryptedAccessToken, tenant.wa_phone_number_id as string, customerPhone, confirmCard)
            .then(() =>
              supabaseAdmin.from('messages').insert({
                tenant_id:       tenant.id,
                conversation_id: conversation.id,
                direction:       'outbound',
                content:         confirmCard,
                message_type:    'text',
                channel:         'whatsapp',
                status:          'sent',
                ai_generated:    false,
              }).then(() => {}, () => {})
            )
            .catch(e => console.error('   ❌ Customer confirmation card failed:', (e as Error).message));
        }
      }

      if (bookingWritten && lead) {
        const automationVars = resolveBookingVariables({
          customerName, customerPhone, guestCount, bookingDate, slotTime,
          reservationId, tableName: assignedTableName,
          specialRequests: contextObj.specialRequests ? String(contextObj.specialRequests) : null,
        }, tenant);

        triggerAutomations({
          tenantId: tenant.id, event: 'booking_confirmed', leadId: lead.id,
          conversationId: conversation.id, phone: customerPhone,
          variables: automationVars,
        }).catch(e => console.error('Automations (booking_confirmed):', e.message));

        const bookingAtUtc = zonedDateTimeToUtc(bookingDate, slotTime, (tenant as any).timezone || 'Asia/Kolkata');
        if (bookingAtUtc) {
          triggerAutomations({
            tenantId: tenant.id, event: 'booking_reminder', leadId: lead.id,
            conversationId: conversation.id, phone: customerPhone,
            eventAt: bookingAtUtc.toISOString(),
            variables: automationVars,
          }).catch(e => console.error('Automations (booking_reminder):', e.message));
        }
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

  // H4: the queue is now drained every minute by pg_cron (migration 20260625).
  // Draining inline on every inbound webhook added the claim/recovery/select
  // load to the hot path for no benefit, so the piggyback was removed.
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

    // Monotonic ordering lives in @/lib/webhook/decisions (unit-tested)
    const allowUpdate = allowStatusUpdate(currentStatus, mappedStatus);

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
    
    // Update conversation last_message_at for UI responsiveness (awaited —
    // void writes die on serverless freeze)
    await supabaseAdmin
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
