// ═══════════════════════════════════════════════════════════
// 🤝 WhatsApp Coexistence webhook handlers
// ═══════════════════════════════════════════════════════════
// Coexistence lets a business run the WhatsApp Business app (on their phone)
// AND the Cloud API on the SAME number simultaneously. Meta then sends three
// extra webhook event types (in addition to the normal `messages`/`statuses`):
//
//   • smb_message_echoes — messages the OWNER sent from their phone after
//                          onboarding. We mirror them into the inbox as
//                          outbound (sent_via='whatsapp_app') and soft-pause
//                          the AI for that chat so the customer never gets a
//                          competing bot reply on top of the human's.
//   • history            — up-to-6-months backfill of prior chats, delivered
//                          in chunks. Imported as is_historical=true with NO
//                          AI / follow-ups / integrations.
//   • smb_app_state_sync — the phone's contacts. We fill blank lead names so
//                          the inbox shows real names, not bare numbers.
//
// These handlers are intentionally SELF-CONTAINED (they do not call into the
// live inbound pipeline in app/api/webhooks/whatsapp/route.ts) so adding them
// cannot regress real-time customer message handling. They run inside the
// route's after() so the webhook still returns 200 well under Meta's 5s budget.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantByPhoneNumberId } from '@/lib/tenant/manager';
import type { Tenant } from '@/lib/types';

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'voice', 'sticker']);
const HISTORY_BATCH_SIZE = 200;

// Digits-only normalisation — Meta delivers numbers without "+", leads are
// stored WITH "+". Matches the convention used by the inbound webhook handler.
function digits(phone: string | undefined | null): string {
  return (phone || '').replace(/\D/g, '');
}

// ── Shared content extractor ────────────────────────────────────────────────
// Mirrors parseMetaWebhook's per-type handling so echoes and history render the
// same way inbound messages do. For media we keep the caption/marker + mime
// type (we do NOT download the binary here — echoes/history can be high-volume
// and the inbox still shows text + captions, which is the overwhelming case).
export interface ExtractedContent {
  content: string;
  messageType: string;       // 'text' | 'image' | 'video' | … | 'unsupported'
  mediaMimeType?: string | null;
  mediaCaption?: string | null;
  fileName?: string | null;
}

export function extractWaMessageContent(msg: Record<string, any>): ExtractedContent {
  const type: string = msg?.type || 'text';

  if (type === 'text') {
    return { content: msg.text?.body || '', messageType: 'text' };
  }
  if (type === 'interactive') {
    const it = msg.interactive?.type;
    const reply = it === 'list_reply' ? msg.interactive?.list_reply
                : it === 'button_reply' ? msg.interactive?.button_reply
                : null;
    return { content: reply?.title || reply?.id || '[Interactive Option]', messageType: 'text' };
  }
  if (type === 'button') {
    return { content: msg.button?.text || msg.button?.payload || '', messageType: 'text' };
  }
  if (MEDIA_TYPES.has(type)) {
    const obj = msg[type] || {};
    return {
      content: obj.caption || `[${type}]`,
      messageType: type,
      mediaMimeType: obj.mime_type || null,
      mediaCaption: obj.caption || null,
      fileName: obj.filename || null,
    };
  }
  if (type === 'location') {
    const loc = msg.location;
    return { content: loc ? `📍 Location: ${loc.latitude}, ${loc.longitude}` : '📍 Location shared', messageType: 'text' };
  }
  if (type === 'contacts') {
    const c = msg.contacts?.[0];
    return { content: c ? `👤 ${c.name?.formatted_name || 'Contact shared'}` : '👤 Contact shared', messageType: 'text' };
  }
  if (type === 'reaction') {
    return { content: msg.reaction?.emoji || '[reaction]', messageType: 'text' };
  }
  return { content: `[${type}]`, messageType: type === 'unsupported' ? 'unsupported' : 'text' };
}

// ── Canonical lead + conversation resolver ──────────────────────────────────
// A deliberately self-contained mirror of the inbound handler's "oldest thread
// wins, reactivate, never orphan" logic. One contact = one conversation thread.
interface ResolvedContact {
  leadId: string | null;
  conversationId: string;
  created: boolean;
}

async function resolveConversationForContact(
  tenantId: string,
  rawPhone: string
): Promise<ResolvedContact | null> {
  const clean = digits(rawPhone);
  if (!clean) return null;
  const plus = '+' + clean;

  // Lead + all threads for this contact, in parallel.
  const [{ data: existingLead }, { data: existingConvs }] = await Promise.all([
    supabaseAdmin.from('leads').select('id')
      .eq('tenant_id', tenantId).in('phone', [plus, clean])
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('conversations').select('id, is_active, created_at')
      .eq('tenant_id', tenantId).in('sender_id', [clean, plus, rawPhone])
      .order('created_at', { ascending: true }),
  ]);

  let leadId: string | null = (existingLead as { id: string } | null)?.id ?? null;
  if (!leadId) {
    const { data: newLead } = await supabaseAdmin.from('leads').upsert(
      {
        tenant_id: tenantId,
        phone: plus,
        channel: 'whatsapp',
        lead_status: 'new',
        lead_score: 10,
        source: 'whatsapp',
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,phone', ignoreDuplicates: true }
    ).select('id').maybeSingle();
    leadId = (newLead as { id: string } | null)?.id ?? null;
    if (!leadId) {
      // upsert ignoreDuplicates returns null on conflict — re-fetch.
      const { data: retry } = await supabaseAdmin.from('leads').select('id')
        .eq('tenant_id', tenantId).in('phone', [plus, clean])
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      leadId = (retry as { id: string } | null)?.id ?? null;
    }
  }

  // Canonical conversation = oldest thread; reactivate + consolidate dupes.
  const convs = (existingConvs as Array<{ id: string; is_active: boolean }>) || [];
  if (convs.length > 0) {
    const canonical = convs[0];
    const dupeIds = convs.slice(1).map(c => c.id);
    if (dupeIds.length > 0) {
      await supabaseAdmin.from('messages').update({ conversation_id: canonical.id }).in('conversation_id', dupeIds);
      await supabaseAdmin.from('conversations').update({ is_active: false }).in('id', dupeIds);
    }
    if (!canonical.is_active) {
      await supabaseAdmin.from('conversations').update({ is_active: true }).eq('id', canonical.id);
    }
    return { leadId, conversationId: canonical.id, created: false };
  }

  // No thread yet — create one.
  const { data: newConv, error } = await supabaseAdmin.from('conversations').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    channel: 'whatsapp',
    sender_id: clean,
    current_step: 'greeting',
    is_active: true,
    bot_paused: false,
    escalated: false,
    message_count: 0,
    last_message_at: new Date().toISOString(),
    context: {},
  }).select('id').single();

  if (error || !newConv) {
    // Race: a parallel insert won — re-fetch the canonical row.
    const { data: reFetched } = await supabaseAdmin.from('conversations').select('id')
      .eq('tenant_id', tenantId).in('sender_id', [clean, plus])
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!reFetched) return null;
    return { leadId, conversationId: (reFetched as { id: string }).id, created: false };
  }
  return { leadId, conversationId: newConv.id, created: true };
}

// ═══════════════════════════════════════════════════════════
// 1. smb_message_echoes — owner replied from their phone
// ═══════════════════════════════════════════════════════════
export async function handleMessageEchoes(value: Record<string, any>): Promise<void> {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const echoes: Array<Record<string, any>> = value?.message_echoes || [];
  if (!phoneNumberId || echoes.length === 0) return;

  const tenant = await getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    console.error(`❌ Coexistence echo: no tenant for phone_number_id=${phoneNumberId}`);
    return;
  }

  for (const echo of echoes) {
    try {
      await processSingleEcho(tenant, echo);
    } catch (err) {
      console.error('❌ Coexistence echo: failed to process one echo:', (err as Error).message);
    }
  }
}

async function processSingleEcho(tenant: Tenant, echo: Record<string, any>): Promise<void> {
  const waMessageId: string | undefined = echo?.id;
  const customer = echo?.to;            // recipient = the customer
  if (!waMessageId || !customer) return;

  // Dedup gate: if this id already exists it's almost certainly an echo of a
  // message WE sent through the Cloud API (same wamid). Skip entirely — do NOT
  // insert a duplicate and do NOT pause the bot for our own outbound.
  const { data: existing } = await supabaseAdmin
    .from('messages').select('id').eq('wa_message_id', waMessageId).maybeSingle();
  if (existing) {
    console.log(`⤴️ Coexistence echo: ${waMessageId} already known — skipping (likely our own API send)`);
    return;
  }

  const resolved = await resolveConversationForContact(tenant.id, customer);
  if (!resolved) {
    console.error(`❌ Coexistence echo: could not resolve conversation for ${customer}`);
    return;
  }

  const { content, messageType, mediaMimeType, mediaCaption, fileName } = extractWaMessageContent(echo);
  const isMedia = MEDIA_TYPES.has(messageType);
  const createdAt = echo.timestamp ? new Date(parseInt(echo.timestamp) * 1000).toISOString() : new Date().toISOString();

  const { error: insertErr } = await supabaseAdmin.from('messages').insert({
    tenant_id: tenant.id,
    conversation_id: resolved.conversationId,
    direction: 'outbound',
    content,
    message_type: isMedia ? messageType : 'text',
    channel: 'whatsapp',
    sender_id: null,
    status: 'sent',
    ai_generated: false,
    sent_via: 'whatsapp_app',
    wa_message_id: waMessageId,
    created_at: createdAt,
    ...(isMedia && {
      mime_type: mediaMimeType || null,
      media_caption: mediaCaption || null,
      file_name: fileName || null,
    }),
  });

  if (insertErr) {
    if (insertErr.code === '23505') return; // concurrent dup — fine
    console.error('❌ Coexistence echo: message insert failed:', insertErr.message);
    return;
  }

  // Soft-pause the AI: the owner is handling this chat from their phone. We reuse
  // the existing escalation machinery (escalated + escalated_at), so the inbound
  // handler's real-time timeout auto-resumes the bot after escalation_timeout_mins.
  const updates: Record<string, any> = { last_message_at: createdAt };
  if (tenant.coexistence_auto_pause !== false) {
    updates.escalated = true;
    updates.escalated_at = new Date().toISOString();
    updates.escalation_reason = 'human_replied_via_app';
  }
  await supabaseAdmin.from('conversations').update(updates).eq('id', resolved.conversationId);

  console.log(`📱 Coexistence echo saved (owner→${digits(customer)}) for ${tenant.business_name}${tenant.coexistence_auto_pause !== false ? ' — bot soft-paused' : ''}`);
}

// ═══════════════════════════════════════════════════════════
// 2. history — 6-month backfill (chunked)
// ═══════════════════════════════════════════════════════════
const HISTORY_STATUS_MAP: Record<string, string> = {
  sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', received: 'delivered',
};

export async function handleHistorySync(value: Record<string, any>): Promise<void> {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const businessDigits = digits(value?.metadata?.display_phone_number);
  const items: Array<Record<string, any>> = value?.history || [];
  if (!phoneNumberId || items.length === 0) return;

  const tenant = await getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    console.error(`❌ Coexistence history: no tenant for phone_number_id=${phoneNumberId}`);
    return;
  }

  for (const item of items) {
    const meta = item?.metadata || {};
    const phase: string | null = meta.phase ?? null;
    const chunkOrder: number | null = typeof meta.chunk_order === 'number' ? meta.chunk_order : null;
    const progress: string | null = meta.progress ?? null;
    const threads: Array<Record<string, any>> = item?.threads || [];

    let importedInChunk = 0;
    for (const thread of threads) {
      const customer = thread?.id;
      const messages: Array<Record<string, any>> = thread?.messages || [];
      if (!customer || messages.length === 0) continue;

      const resolved = await resolveConversationForContact(tenant.id, customer);
      if (!resolved) continue;

      const customerDigits = digits(customer);
      let maxTs = 0;
      const rows = messages.map((m) => {
        const outbound = digits(m.from) === businessDigits;
        const { content, messageType, mediaMimeType, mediaCaption, fileName } = extractWaMessageContent(m);
        const isMedia = MEDIA_TYPES.has(messageType);
        const tsMs = m.timestamp ? parseInt(m.timestamp) * 1000 : Date.now();
        if (tsMs > maxTs) maxTs = tsMs;
        const status = HISTORY_STATUS_MAP[m?.history_context?.status] || (outbound ? 'delivered' : 'delivered');
        return {
          tenant_id: tenant.id,
          conversation_id: resolved.conversationId,
          direction: outbound ? 'outbound' : 'inbound',
          content,
          message_type: isMedia ? messageType : 'text',
          channel: 'whatsapp',
          sender_id: outbound ? null : customerDigits,
          status,
          ai_generated: false,
          sent_via: outbound ? 'whatsapp_app' : null,
          is_historical: true,
          wa_message_id: m.id || null,
          created_at: new Date(tsMs).toISOString(),
          ...(isMedia && { mime_type: mediaMimeType || null, media_caption: mediaCaption || null, file_name: fileName || null }),
        };
      });

      // Bulk insert in batches; dedup on wa_message_id so re-delivered chunks
      // (and overlap with already-synced live messages) never duplicate.
      for (let i = 0; i < rows.length; i += HISTORY_BATCH_SIZE) {
        const batch = rows.slice(i, i + HISTORY_BATCH_SIZE);
        const { error } = await supabaseAdmin
          .from('messages')
          .upsert(batch, { onConflict: 'wa_message_id', ignoreDuplicates: true });
        if (error) {
          console.error('❌ Coexistence history: batch upsert failed:', error.message);
        } else {
          importedInChunk += batch.length;
        }
      }

      // For a freshly-created thread, surface it in the inbox at its real
      // recency (the newest historical message), not "now".
      if (resolved.created && maxTs > 0) {
        await supabaseAdmin.from('conversations')
          .update({ last_message_at: new Date(maxTs).toISOString() })
          .eq('id', resolved.conversationId);
      }
    }

    await recordHistoryChunk(tenant, { phase, chunkOrder, progress, imported: importedInChunk });
    console.log(`🗂️ Coexistence history: phase=${phase} chunk=${chunkOrder} imported≈${importedInChunk} progress=${progress} (${tenant.business_name})`);
  }
}

async function recordHistoryChunk(
  tenant: Tenant,
  c: { phase: string | null; chunkOrder: number | null; progress: string | null; imported: number }
): Promise<void> {
  const completed = c.progress != null && parseInt(c.progress) >= 100;
  const { error } = await supabaseAdmin.from('coexistence_history_sync').upsert(
    {
      tenant_id: tenant.id,
      waba_id: tenant.wa_waba_id ?? null,
      phone_number_id: tenant.wa_phone_number_id ?? null,
      phase: c.phase,
      chunk_order: c.chunkOrder,
      progress: c.progress,
      messages_imported: c.imported,
      status: completed ? 'completed' : 'in_progress',
      updated_at: new Date().toISOString(),
      ...(completed && { completed_at: new Date().toISOString() }),
    },
    { onConflict: 'tenant_id,phase,chunk_order' }
  );
  if (error) console.error('❌ Coexistence history: sync-status upsert failed:', error.message);
}

// ═══════════════════════════════════════════════════════════
// 3. smb_app_state_sync — contact names from the phone
// ═══════════════════════════════════════════════════════════
export async function handleContactSync(value: Record<string, any>): Promise<void> {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const entries: Array<Record<string, any>> = value?.state_sync || [];
  if (!phoneNumberId || entries.length === 0) return;

  const tenant = await getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    console.error(`❌ Coexistence contact sync: no tenant for phone_number_id=${phoneNumberId}`);
    return;
  }

  for (const entry of entries) {
    if (entry?.type !== 'contact') continue;
    const action: string = entry?.action || 'add';
    if (action === 'remove') continue; // never delete a lead from a contact removal

    const contact = entry?.contact || {};
    const name: string = (contact.full_name || contact.first_name || '').trim();
    const phone = digits(contact.phone_number);
    if (!phone || !name) continue;
    const plus = '+' + phone;

    try {
      const { data: lead } = await supabaseAdmin.from('leads').select('id, name')
        .eq('tenant_id', tenant.id).in('phone', [plus, phone])
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (lead) {
        // Fill the name only when blank — never clobber a name the CRM edited.
        if (!(lead as { name?: string }).name) {
          await supabaseAdmin.from('leads')
            .update({ name, wa_contact_synced_at: new Date().toISOString() })
            .eq('id', (lead as { id: string }).id);
        }
      } else {
        await supabaseAdmin.from('leads').upsert(
          {
            tenant_id: tenant.id,
            phone: plus,
            name,
            channel: 'whatsapp',
            lead_status: 'new',
            lead_score: 10,
            source: 'whatsapp',
            wa_contact_synced_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,phone', ignoreDuplicates: true }
        );
      }

      // Surface the name in the inbox header too, when the thread exists and is unnamed.
      await supabaseAdmin.from('conversations')
        .update({ sender_name: name })
        .eq('tenant_id', tenant.id).in('sender_id', [phone, plus]).is('sender_name', null);
    } catch (err) {
      console.error('❌ Coexistence contact sync: failed for one contact:', (err as Error).message);
    }
  }
  console.log(`👥 Coexistence contact sync: processed ${entries.length} entry(ies) for ${tenant.business_name}`);
}

// ═══════════════════════════════════════════════════════════
// Dispatcher — called from the webhook route's after()
// ═══════════════════════════════════════════════════════════
export const COEXISTENCE_FIELDS = new Set(['smb_message_echoes', 'history', 'smb_app_state_sync']);

// Returns true if this webhook change is a coexistence event (so the route can
// route it here and skip the normal message/status parse).
export function isCoexistenceChange(field: string | undefined, value: Record<string, any> | undefined): boolean {
  if (field && COEXISTENCE_FIELDS.has(field)) return true;
  return !!(value && (value.message_echoes || value.history || value.state_sync));
}

export async function handleCoexistenceWebhook(
  field: string | undefined,
  value: Record<string, any> | undefined
): Promise<void> {
  if (!value) return;
  if (field === 'smb_message_echoes' || value.message_echoes) return handleMessageEchoes(value);
  if (field === 'history' || value.history)                  return handleHistorySync(value);
  if (field === 'smb_app_state_sync' || value.state_sync)    return handleContactSync(value);
}
