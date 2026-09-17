// Browser-only client for the operator attachment pipeline
// (see src/lib/media/outbound-media.server.ts for the server half).

import type { Message } from '@/lib/types';
import { normalizeMimeType, planOutboundMedia, type WhatsAppSendAs } from './outbound-media';
import { convertImageForWhatsApp, imageNeedsConversion } from './client-image';

export interface PreparedAttachment {
  file: File;
  mimeType: string;
  sendAs: WhatsAppSendAs;
  note: string | null;
}

/**
 * Validate a picked file and, for photos, convert it into something WhatsApp
 * accepts. Throws an Error with an operator-readable message when it can't be sent.
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  let mimeType = normalizeMimeType(file.type, file.name);
  let prepared = file;
  let conversionNote: string | null = null;

  if (imageNeedsConversion(mimeType, file.size)) {
    prepared = await convertImageForWhatsApp(file, mimeType);
    conversionNote = mimeType === 'image/gif'
      ? 'GIFs arrive on WhatsApp as a still photo.'
      : mimeType === 'image/jpeg' || mimeType === 'image/png'
        ? 'Compressed to fit WhatsApp’s 5 MB photo limit.'
        : 'Converted to JPG for WhatsApp.';
    mimeType = 'image/jpeg';
  } else if (file.type !== mimeType) {
    // Some Android pickers report '' or an alias — upload with the canonical type.
    prepared = new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
  }

  const plan = planOutboundMedia(mimeType, prepared.size);
  if (!plan.ok) throw new Error(plan.message);
  return { file: prepared, mimeType, sendAs: plan.sendAs, note: conversionNote };
}

interface ApiResult {
  ok: boolean;
  status: number;
  code?: string;
  error?: string;
  message?: Message;
  [key: string]: unknown;
}

async function postJson(url: string, body: unknown): Promise<ApiResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK', error: 'You appear to be offline. Check your connection and retry.' };
  }
  // Gateway errors (504 timeout pages etc.) aren't JSON — never surface a parse error.
  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!data) {
    return {
      ok: false,
      status: res.status,
      code: res.status === 504 ? 'TIMEOUT' : 'BAD_RESPONSE',
      error: res.status === 504 ? 'The server took too long to respond. Please retry.' : 'Something went wrong. Please retry.',
    };
  }
  return {
    ...data,
    ok: res.ok && data.success === true,
    status: res.status,
    code: data.code as string | undefined,
    error: (data.error as string | undefined) || (res.ok ? undefined : 'Something went wrong. Please retry.'),
    message: data.message as Message | undefined,
  };
}

export interface UploadTarget {
  uploadUrl: string;
  storagePath: string;
  contentType: string;
  sendAs: WhatsAppSendAs;
}

export class AttachmentError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

export async function requestUploadTarget(input: {
  conversationId: string;
  file: File;
}): Promise<UploadTarget> {
  const r = await postJson('/api/chat/media/upload-url', {
    conversationId: input.conversationId,
    fileName: input.file.name,
    mimeType: input.file.type,
    size: input.file.size,
  });
  if (!r.ok || typeof r.uploadUrl !== 'string' || typeof r.storagePath !== 'string') {
    throw new AttachmentError(r.error || 'Couldn’t start the upload. Please retry.', r.code);
  }
  return {
    uploadUrl: r.uploadUrl,
    storagePath: r.storagePath,
    contentType: String(r.contentType || input.file.type),
    sendAs: r.sendAs as WhatsAppSendAs,
  };
}

/** PUT the file straight to Supabase Storage via the signed URL, reporting 0-100 progress. */
export function uploadToSignedUrl(
  target: UploadTarget,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.uploadUrl);
    // Same request shape the scripted-replies uploader already uses in prod:
    // only Content-Type (stored as the object's MIME). Upsert defaults to false,
    // so a signed URL can never overwrite an object that was already verified.
    xhr.setRequestHeader('Content-Type', target.contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      // Every attempt uses a fresh signed URL + object path, so a retry never
      // collides with an earlier (possibly half-finished) upload.
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else if (xhr.status === 413) {
        reject(new AttachmentError('This file is too large to upload.', 'FILE_TOO_LARGE'));
      } else {
        reject(new AttachmentError('Upload failed. Please retry.', `STORAGE_${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new AttachmentError('Upload interrupted — check your connection and retry.', 'NETWORK'));
    xhr.ontimeout = () => reject(new AttachmentError('Upload timed out. Please retry.', 'TIMEOUT'));
    xhr.send(file);
  });
}

export function sendUploadedAttachment(input: {
  conversationId: string;
  storagePath: string;
  fileName: string;
  caption: string;
  replyToMessageId: string | null;
}): Promise<ApiResult> {
  return postJson('/api/chat/media/send', input);
}

export function retryAttachmentMessage(messageId: string): Promise<ApiResult> {
  return postJson('/api/chat/media/retry', { messageId });
}

// Send-step codes after which the stored object is gone or unusable, so a retry
// must upload the file again rather than reuse the storage path.
export const REUPLOAD_CODES = new Set(['UPLOAD_NOT_FOUND', 'INVALID_FILE', 'FORBIDDEN_PATH']);
