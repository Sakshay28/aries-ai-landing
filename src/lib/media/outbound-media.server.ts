// ═══════════════════════════════════════════════════════════
// Outbound chat media — server pipeline
// ═══════════════════════════════════════════════════════════
// Operator → WhatsApp media, end to end:
//
//   1. issueChatMediaUpload   auth'd, tenant + conversation checked, type/size
//                             planned → one-time signed storage upload URL for a
//                             random object path. The browser uploads the bytes
//                             straight to Supabase Storage, so Vercel's 4.5 MB
//                             function body limit never applies.
//   2. sendStoredChatMedia    re-verifies the object that actually landed
//                             (size, stored MIME, magic bytes), persists ONE
//                             message row keyed by its storage path (idempotent),
//                             then delivers it to Meta and records the outcome.
//   3. retryChatMedia         atomically re-claims a failed (or timed-out
//                             pending) row and delivers it again — same row, no
//                             duplicate bubble, no re-upload from the browser.
//
// Delivery: files ≤ 5 MB are uploaded to Meta and sent by media ID (Meta
// validates them synchronously); larger ones are sent by a freshly signed
// storage link minted per attempt, so a retry can never reuse an expired URL.
// Nothing here writes a signed URL to the database or the logs.

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { MetaApiError, uploadMediaToMeta, sendWhatsAppMedia, type MetaSendResult, type WhatsAppMediaRef } from '@/lib/meta/service';
import type { ChatMediaMeta, Message } from '@/lib/types';
import {
  CHAT_MEDIA_BUCKET,
  PROVIDER_UPLOAD_MAX_BYTES,
  SESSION_EXPIRED,
  STALE_PENDING_MS,
  buildChatMediaPath,
  bytesMatchMimeType,
  friendlyProviderReason,
  isUuid,
  normalizeMimeType,
  parseOwnedChatMediaPath,
  planOutboundMedia,
  sanitizeDisplayFileName,
  type WhatsAppSendAs,
} from './outbound-media';
import { logMediaEvent, redactSensitive } from './media-log';

// Meta downloads a link at send time; a fresh link is minted on every attempt,
// so this only has to outlive Meta's own fetch.
const SIGNED_LINK_TTL_SECS = 60 * 60;
const INSPECT_BYTES = 64;
// Meta media IDs expire after 30 days — re-upload well before that.
const PROVIDER_MEDIA_ID_MAX_AGE_MS = 25 * 24 * 60 * 60 * 1000;
const MAX_CAPTION = 1024;

export interface MediaResult {
  ok: boolean;
  httpStatus: number;
  code?: string;
  error?: string;
  message?: Message;
  deduped?: boolean;
}

type Row = Message & { retry_count?: number | null; failure_reason?: string | null };

class PipelineError extends Error {
  constructor(public code: string, message: string, public httpStatus: number) {
    super(message);
  }
}

class StorageObjectMissing extends Error {}

function fail(err: unknown): MediaResult {
  if (err instanceof PipelineError) return { ok: false, httpStatus: err.httpStatus, code: err.code, error: err.message };
  throw err;
}

function mediaMeta(row: Row): ChatMediaMeta | null {
  const meta = (row.metadata as unknown as { media?: ChatMediaMeta } | null)?.media;
  return meta?.storage_path ? meta : null;
}

// ── Lookups (always tenant-scoped) ───────────────────────────────────────────

interface ConversationTarget { id: string; channel: string; recipient: string }

async function loadConversation(tenantId: string, conversationId: string): Promise<ConversationTarget> {
  if (!isUuid(conversationId)) throw new PipelineError('INVALID_CONVERSATION', 'Invalid conversation.', 400);
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, tenant_id, channel, sender_id, leads(phone)')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new PipelineError('DB_UNAVAILABLE', 'Couldn’t load this conversation. Please try again.', 503);
  if (!data) throw new PipelineError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404);

  const leads = data.leads as unknown as { phone: string | null } | { phone: string | null }[] | null;
  const leadPhone = Array.isArray(leads) ? leads[0]?.phone : leads?.phone;
  const channel = (data.channel as string) || 'whatsapp';
  if (channel === 'instagram_dm') {
    throw new PipelineError('CHANNEL_UNSUPPORTED', 'Sending photos and files on Instagram isn’t supported yet.', 422);
  }
  const recipient = leadPhone || (data.sender_id as string | null);
  if (!recipient) throw new PipelineError('NO_RECIPIENT', 'This contact has no WhatsApp number.', 422);
  return { id: data.id as string, channel, recipient };
}

interface WhatsAppCreds { accessToken: string; phoneNumberId: string }

async function loadWhatsAppCredentials(tenantId: string): Promise<WhatsAppCreds> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_phone_number_id')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw new PipelineError('DB_UNAVAILABLE', 'Couldn’t load your WhatsApp settings. Please try again.', 503);
  if (!data?.wa_access_token || !data?.wa_phone_number_id) {
    throw new PipelineError('WHATSAPP_NOT_CONNECTED', 'WhatsApp isn’t connected for your account yet.', 400);
  }
  const accessToken = decryptToken(data.wa_access_token as string);
  if (!accessToken) {
    throw new PipelineError('WHATSAPP_NOT_CONNECTED', 'Your WhatsApp connection needs to be re-saved in Settings.', 400);
  }
  return { accessToken, phoneNumberId: data.wa_phone_number_id as string };
}

async function findMessageByStoragePath(tenantId: string, storagePath: string): Promise<Row | null> {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('metadata->media->>storage_path', storagePath)
    .limit(1)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

// ── Storage inspection ───────────────────────────────────────────────────────

interface StoredObject { size: number; contentType: string; head: Uint8Array }

/** Reads size, stored MIME type and the first bytes of an object with one ranged GET. */
async function inspectStoredObject(storagePath: string): Promise<StoredObject | null> {
  const { data, error } = await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) {
    if (error && /not.?found|does not exist/i.test(error.message)) return null;
    throw new PipelineError('STORAGE_UNAVAILABLE', 'Storage is temporarily unavailable. Please try again.', 503);
  }

  let res: Response;
  try {
    res = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${INSPECT_BYTES - 1}` },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PipelineError('STORAGE_UNAVAILABLE', 'Storage is temporarily unavailable. Please try again.', 503);
  }
  if (res.status === 404 || res.status === 400) return null;
  if (res.status !== 200 && res.status !== 206) {
    throw new PipelineError('STORAGE_UNAVAILABLE', 'Storage is temporarily unavailable. Please try again.', 503);
  }

  const range = res.headers.get('content-range');
  const total = range?.match(/\/(\d+)\s*$/)?.[1] ?? res.headers.get('content-length');
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, INSPECT_BYTES);
  return {
    size: Number(total ?? head.length),
    contentType: normalizeMimeType(res.headers.get('content-type')),
    head,
  };
}

async function removeObject(storagePath: string): Promise<void> {
  await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).remove([storagePath]).catch(() => undefined);
}

// ── 1. Issue a direct upload URL ─────────────────────────────────────────────

export async function issueChatMediaUpload(input: {
  tenantId: string;
  conversationId: unknown;
  fileName: unknown;
  mimeType: unknown;
  size: unknown;
}): Promise<MediaResult & { upload?: { uploadUrl: string; storagePath: string; contentType: string; sendAs: WhatsAppSendAs } }> {
  const { tenantId } = input;
  try {
    const conversationId = String(input.conversationId ?? '');
    const size = Number(input.size);
    const mimeType = normalizeMimeType(typeof input.mimeType === 'string' ? input.mimeType : '', typeof input.fileName === 'string' ? input.fileName : '');
    const plan = planOutboundMedia(mimeType, size);
    if (!plan.ok) {
      logMediaEvent('MEDIA_UPLOAD_FAILED', { tenantId, conversationId, mimeType, fileSize: size, reason: plan.code, errorStage: 'plan' });
      return { ok: false, httpStatus: plan.code === 'UNSUPPORTED_TYPE' || plan.code === 'EMPTY_FILE' ? 400 : 413, code: plan.code, error: plan.message };
    }

    await loadConversation(tenantId, conversationId);
    await loadWhatsAppCredentials(tenantId); // fail before the operator uploads 16 MB for nothing

    const storagePath = buildChatMediaPath(tenantId, conversationId, randomUUID(), plan.ext);
    const { data, error } = await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl) {
      logMediaEvent('MEDIA_UPLOAD_FAILED', { tenantId, conversationId, reason: 'signed_upload_url', detail: error?.message });
      return { ok: false, httpStatus: 503, code: 'STORAGE_UNAVAILABLE', error: 'Storage is temporarily unavailable. Please try again.' };
    }

    logMediaEvent('MEDIA_UPLOAD_STARTED', { tenantId, conversationId, sendAs: plan.sendAs, mimeType: plan.mimeType, fileSize: size });
    return {
      ok: true,
      httpStatus: 200,
      upload: { uploadUrl: data.signedUrl, storagePath, contentType: plan.mimeType, sendAs: plan.sendAs },
    };
  } catch (err) {
    return fail(err);
  }
}

// ── 2. Verify the stored object, persist, deliver ────────────────────────────

export async function sendStoredChatMedia(input: {
  tenantId: string;
  conversationId: unknown;
  storagePath: unknown;
  fileName?: unknown;
  caption?: unknown;
  replyToMessageId?: unknown;
}): Promise<MediaResult> {
  const { tenantId } = input;
  const conversationId = String(input.conversationId ?? '');
  try {
    if (!isUuid(conversationId)) throw new PipelineError('INVALID_CONVERSATION', 'Invalid conversation.', 400);
    const owned = parseOwnedChatMediaPath(input.storagePath, tenantId, conversationId);
    if (!owned) {
      logMediaEvent('MEDIA_UPLOAD_FAILED', { tenantId, conversationId, reason: 'path_not_owned' });
      throw new PipelineError('FORBIDDEN_PATH', 'This upload doesn’t belong to this conversation.', 403);
    }
    const storagePath = input.storagePath as string;
    const caption = typeof input.caption === 'string' ? input.caption.trim().slice(0, MAX_CAPTION) : '';
    const replyToMessageId = isUuid(input.replyToMessageId) ? input.replyToMessageId : null;

    const conversation = await loadConversation(tenantId, conversationId);

    // Idempotency: one storage object → one message, whatever the client repeats.
    const existing = await findMessageByStoragePath(tenantId, storagePath);
    if (existing) {
      logMediaEvent('MEDIA_SEND_DEDUPED', { tenantId, conversationId, messageId: existing.id });
      return { ok: existing.status !== 'failed', httpStatus: 200, message: existing, deduped: true, error: existing.status === 'failed' ? existing.error_message ?? undefined : undefined };
    }

    const creds = await loadWhatsAppCredentials(tenantId);

    const stored = await inspectStoredObject(storagePath);
    if (!stored) {
      logMediaEvent('MEDIA_UPLOAD_FAILED', { tenantId, conversationId, reason: 'object_missing' });
      throw new PipelineError('UPLOAD_NOT_FOUND', 'The upload didn’t finish. Please attach the file again.', 400);
    }

    const plan = planOutboundMedia(stored.contentType, stored.size);
    const valid = plan.ok && plan.ext === owned.ext && bytesMatchMimeType(stored.head, stored.contentType);
    if (!plan.ok || !valid) {
      await removeObject(storagePath);
      logMediaEvent('MEDIA_UPLOAD_FAILED', {
        tenantId, conversationId, mimeType: stored.contentType, fileSize: stored.size,
        reason: plan.ok ? 'content_mismatch' : plan.code, errorStage: 'validate',
      });
      throw new PipelineError(
        'INVALID_FILE',
        plan.ok ? 'This file looks corrupted or isn’t what its name says. Please choose another file.' : plan.message,
        plan.ok ? 415 : 400
      );
    }
    logMediaEvent('MEDIA_UPLOAD_SUCCESS', { tenantId, conversationId, sendAs: plan.sendAs, mimeType: plan.mimeType, fileSize: stored.size });

    const displayName = sanitizeDisplayFileName(input.fileName, plan.ext);
    const now = new Date().toISOString();
    const meta: ChatMediaMeta = {
      bucket: CHAT_MEDIA_BUCKET,
      storage_path: storagePath,
      send_as: plan.sendAs,
      attempts: 1,
      stage: 'provider_upload',
      attempt_started_at: now,
    };
    const { data: publicUrl } = supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(storagePath);

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: caption || displayName,
        message_type: plan.sendAs,
        channel: conversation.channel,
        sender_id: null,
        status: 'pending',
        ai_generated: false,
        media_url: publicUrl.publicUrl,
        file_name: displayName,
        file_size: stored.size,
        mime_type: plan.mimeType,
        media_caption: caption || null,
        reply_to_message_id: replyToMessageId,
        metadata: { media: meta },
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      // Lost a race with an identical request (unique storage_path index).
      if (insertErr?.code === '23505') {
        const winner = await findMessageByStoragePath(tenantId, storagePath);
        if (winner) {
          logMediaEvent('MEDIA_SEND_DEDUPED', { tenantId, conversationId, messageId: winner.id });
          return { ok: true, httpStatus: 200, message: winner, deduped: true };
        }
      }
      logMediaEvent('MEDIA_SEND_FAILED', { tenantId, conversationId, errorStage: 'persist', detail: insertErr?.message });
      throw new PipelineError('DB_UNAVAILABLE', 'Couldn’t save the message. Please try again.', 503);
    }

    return await deliver(inserted as Row, meta, conversation, creds);
  } catch (err) {
    return fail(err);
  }
}

// ── 3. Retry a failed / stuck media message ──────────────────────────────────

export async function retryChatMedia(input: { tenantId: string; messageId: unknown }): Promise<MediaResult> {
  const { tenantId } = input;
  try {
    if (!isUuid(input.messageId)) throw new PipelineError('INVALID_MESSAGE', 'Invalid message.', 400);
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('id', input.messageId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new PipelineError('DB_UNAVAILABLE', 'Couldn’t load this message. Please try again.', 503);
    if (!data) throw new PipelineError('MESSAGE_NOT_FOUND', 'Message not found.', 404);

    const row = data as Row;
    const meta = mediaMeta(row);
    if (row.direction !== 'outbound' || !meta) {
      throw new PipelineError('NOT_RETRYABLE', 'Only attachments sent from the inbox can be retried.', 400);
    }

    const startedAt = Date.parse(meta.attempt_started_at || row.created_at);
    const stalePending = row.status === 'pending' && !row.wa_message_id && Date.now() - startedAt > STALE_PENDING_MS;
    if (row.status !== 'failed' && !stalePending) {
      logMediaEvent('MEDIA_RETRY_REJECTED', { tenantId, messageId: row.id, reason: `status_${row.status}` });
      return { ok: false, httpStatus: 409, code: 'NOT_RETRYABLE', error: 'This message is already being sent.', message: row };
    }

    const conversation = await loadConversation(tenantId, row.conversation_id);
    const creds = await loadWhatsAppCredentials(tenantId);

    // Compare-and-swap on (status, retry_count): of two simultaneous retries
    // exactly one matches a row; the other gets 409 and sends nothing.
    const retryCount = row.retry_count ?? 0;
    const nextMeta: ChatMediaMeta = {
      ...meta,
      attempts: (meta.attempts || 1) + 1,
      stage: 'provider_upload',
      attempt_started_at: new Date().toISOString(),
    };
    let claim = supabaseAdmin
      .from('messages')
      .update({
        status: 'pending',
        error_message: null,
        failure_reason: null,
        retry_count: retryCount + 1,
        metadata: { ...(row.metadata as object | null), media: nextMeta },
      })
      .eq('id', row.id)
      .eq('tenant_id', tenantId)
      .eq('status', row.status);
    claim = row.retry_count == null ? claim.is('retry_count', null) : claim.eq('retry_count', retryCount);
    const { data: claimed, error: claimErr } = await claim.select();

    if (claimErr) throw new PipelineError('DB_UNAVAILABLE', 'Couldn’t retry right now. Please try again.', 503);
    if (!claimed || claimed.length === 0) {
      logMediaEvent('MEDIA_RETRY_REJECTED', { tenantId, messageId: row.id, reason: 'claim_lost' });
      return { ok: false, httpStatus: 409, code: 'ALREADY_RETRYING', error: 'This message is already being retried.' };
    }

    logMediaEvent('MEDIA_RETRY_CLAIMED', { tenantId, conversationId: row.conversation_id, messageId: row.id, attempt: nextMeta.attempts });
    return await deliver(claimed[0] as Row, nextMeta, conversation, creds);
  } catch (err) {
    return fail(err);
  }
}

// ── Legacy multipart entry point (/api/chat/upload) ──────────────────────────
// Kept so a dashboard tab still running the previous bundle keeps working for
// files under Vercel's body limit. Stores the bytes, then runs the same path.

export async function storeAndSendChatMedia(input: {
  tenantId: string;
  conversationId: unknown;
  file: File;
  caption?: unknown;
  replyToMessageId?: unknown;
}): Promise<MediaResult> {
  const { tenantId, file } = input;
  const conversationId = String(input.conversationId ?? '');
  try {
    const mimeType = normalizeMimeType(file.type, file.name);
    const plan = planOutboundMedia(mimeType, file.size);
    if (!plan.ok) return { ok: false, httpStatus: plan.code === 'UNSUPPORTED_TYPE' || plan.code === 'EMPTY_FILE' ? 400 : 413, code: plan.code, error: plan.message };

    await loadConversation(tenantId, conversationId);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytesMatchMimeType(bytes.slice(0, INSPECT_BYTES), plan.mimeType)) {
      logMediaEvent('MEDIA_UPLOAD_FAILED', { tenantId, conversationId, mimeType: plan.mimeType, fileSize: file.size, reason: 'content_mismatch' });
      return { ok: false, httpStatus: 415, code: 'INVALID_FILE', error: 'This file looks corrupted or isn’t what its name says. Please choose another file.' };
    }

    const storagePath = buildChatMediaPath(tenantId, conversationId, randomUUID(), plan.ext);
    const { error } = await supabaseAdmin.storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(storagePath, bytes, { contentType: plan.mimeType, upsert: false });
    if (error) {
      logMediaEvent('MEDIA_STORAGE_FAILED', { tenantId, conversationId, detail: error.message });
      return { ok: false, httpStatus: 503, code: 'STORAGE_UNAVAILABLE', error: 'Storage is temporarily unavailable. Please try again.' };
    }
    logMediaEvent('MEDIA_STORAGE_SUCCESS', { tenantId, conversationId, sendAs: plan.sendAs, mimeType: plan.mimeType, fileSize: file.size });

    return await sendStoredChatMedia({ tenantId, conversationId, storagePath, fileName: file.name, caption: input.caption, replyToMessageId: input.replyToMessageId });
  } catch (err) {
    return fail(err);
  }
}

// ── Provider delivery ────────────────────────────────────────────────────────

async function deliver(row: Row, meta: ChatMediaMeta, conversation: ConversationTarget, creds: WhatsAppCreds): Promise<MediaResult> {
  const tenantId = row.tenant_id;
  const started = Date.now();
  const base = { tenantId, conversationId: row.conversation_id, messageId: row.id, sendAs: meta.send_as, provider: 'whatsapp' as const, attempt: meta.attempts };
  const mimeType = row.mime_type || 'application/octet-stream';
  const fileName = row.file_name || `file`;
  const caption = row.media_caption || undefined;
  let stage: 'provider_upload' | 'sending' = 'provider_upload';
  let providerMediaId: string | null = meta.provider_media_id ?? null;
  let providerMediaIdAt: string | null = meta.provider_media_id_at ?? null;
  let deliveryMode: 'media_id' | 'link' = 'media_id';

  try {
    let contextMessageId: string | undefined;
    if (row.reply_to_message_id) {
      const { data: parent } = await supabaseAdmin
        .from('messages')
        .select('wa_message_id')
        .eq('id', row.reply_to_message_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      contextMessageId = (parent?.wa_message_id as string | undefined) || undefined;
    }

    const common: Omit<WhatsAppMediaRef, 'mediaId' | 'link'> = {
      sendAs: meta.send_as,
      caption,
      filename: fileName,
      contextMessageId,
    };

    const freshReference = async (): Promise<Pick<WhatsAppMediaRef, 'mediaId' | 'link'>> => {
      stage = 'provider_upload';
      if ((row.file_size ?? Infinity) <= PROVIDER_UPLOAD_MAX_BYTES) {
        deliveryMode = 'media_id';
        const { data: blob, error } = await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).download(meta.storage_path);
        if (error || !blob) throw new StorageObjectMissing(error?.message || 'download failed');
        logMediaEvent('MEDIA_PROVIDER_UPLOAD_STARTED', { ...base, mimeType, fileSize: row.file_size ?? undefined });
        const buffer = Buffer.from(await blob.arrayBuffer());
        providerMediaId = await uploadMediaToMeta(creds.accessToken, creds.phoneNumberId, buffer, mimeType, fileName);
        providerMediaIdAt = new Date().toISOString();
        logMediaEvent('MEDIA_PROVIDER_UPLOAD_SUCCESS', { ...base, deliveryMode });
        return { mediaId: providerMediaId };
      }
      deliveryMode = 'link';
      const { data, error } = await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(meta.storage_path, SIGNED_LINK_TTL_SECS);
      if (error || !data?.signedUrl) throw new StorageObjectMissing(error?.message || 'sign failed');
      return { link: data.signedUrl };
    };

    const cachedIdUsable = !!providerMediaId && !!providerMediaIdAt
      && Date.now() - Date.parse(providerMediaIdAt) < PROVIDER_MEDIA_ID_MAX_AGE_MS;
    if (!cachedIdUsable) {
      providerMediaId = null;
      providerMediaIdAt = null;
    }

    let result: MetaSendResult | undefined;
    if (cachedIdUsable) {
      stage = 'sending';
      logMediaEvent('MEDIA_SEND_STARTED', { ...base, deliveryMode: 'media_id' });
      try {
        result = await sendWhatsAppMedia(creds.accessToken, creds.phoneNumberId, conversation.recipient, { ...common, mediaId: providerMediaId! });
      } catch (err) {
        // A stale/expired media ID is rejected as a bad request — upload afresh
        // once. Anything else (throttle, auth, window closed) is the real answer.
        const staleId = err instanceof MetaApiError && !err.isRateLimited && [100, 131009, 131053].includes(err.code ?? -1);
        if (!staleId) throw err;
        providerMediaId = null;
      }
    }
    if (!result) {
      const ref = await freshReference();
      stage = 'sending';
      logMediaEvent('MEDIA_SEND_STARTED', { ...base, deliveryMode });
      result = await sendWhatsAppMedia(creds.accessToken, creds.phoneNumberId, conversation.recipient, { ...common, ...ref });
    }

    const sentMeta: ChatMediaMeta = {
      ...meta,
      stage: 'sent',
      delivery_mode: deliveryMode,
      provider_media_id: providerMediaId,
      provider_media_id_at: providerMediaIdAt,
      last_error: null,
    };
    const { data: updated } = await supabaseAdmin
      .from('messages')
      .update({
        status: 'sent',
        wa_message_id: result.messageId || null,
        error_message: null,
        failure_reason: null,
        metadata: { ...(row.metadata as object | null), media: sentMeta },
      })
      .eq('id', row.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), is_active: true })
      .eq('id', row.conversation_id)
      .eq('tenant_id', tenantId);

    logMediaEvent('MEDIA_SEND_SUCCESS', { ...base, deliveryMode, providerMessageId: result.messageId, durationMs: Date.now() - started });
    return {
      ok: true,
      httpStatus: 200,
      message: (updated as Message | null) ?? ({ ...row, status: 'sent', wa_message_id: result.messageId || null } as Message),
    };
  } catch (err) {
    let errorMessage: string;
    let code: string;
    let fbtraceId: string | undefined;
    if (err instanceof StorageObjectMissing) {
      code = 'storage_missing';
      errorMessage = 'The original file is no longer available. Please attach it again.';
    } else if (err instanceof MetaApiError) {
      code = String(err.code ?? err.status);
      fbtraceId = err.fbtraceId;
      errorMessage = err.code === 131047 ? SESSION_EXPIRED : friendlyProviderReason(err.code, { rateLimited: err.isRateLimited });
    } else {
      code = 'network';
      errorMessage = 'Couldn’t reach WhatsApp. Please try again.';
    }

    logMediaEvent(stage === 'provider_upload' ? 'MEDIA_PROVIDER_UPLOAD_FAILED' : 'MEDIA_SEND_FAILED', {
      ...base, deliveryMode, errorCode: code, errorStage: stage, fbtraceId,
      detail: redactSensitive((err as Error)?.message || ''), durationMs: Date.now() - started,
    });

    const failedMeta: ChatMediaMeta = {
      ...meta,
      stage: 'failed',
      delivery_mode: deliveryMode,
      provider_media_id: providerMediaId,
      provider_media_id_at: providerMediaIdAt,
      last_error: { code, stage, at: new Date().toISOString() },
    };
    const { data: updated } = await supabaseAdmin
      .from('messages')
      .update({
        status: 'failed',
        error_message: errorMessage,
        failure_reason: `${stage}:${code}${fbtraceId ? ` fbtrace=${fbtraceId}` : ''}`.slice(0, 200),
        metadata: { ...(row.metadata as object | null), media: failedMeta },
      })
      .eq('id', row.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    return {
      ok: false,
      httpStatus: 502,
      code: 'PROVIDER_REJECTED',
      error: errorMessage,
      message: (updated as Message | null) ?? ({ ...row, status: 'failed', error_message: errorMessage } as Message),
    };
  }
}
