// ═══════════════════════════════════════════════════════════
// Outbound chat media — shared rules (browser + server)
// ═══════════════════════════════════════════════════════════
// Single source of truth for what an operator may send from the inbox and how
// it goes out on WhatsApp. Pure functions only: the composer uses them to
// reject/label a file before uploading, and the server re-applies them to the
// bytes that actually landed in storage (the client is never trusted).
//
// Limits are Meta's published Cloud API limits
// (developers.facebook.com/docs/whatsapp/cloud-api/reference/media):
//   image    image/jpeg, image/png                      5 MB
//   video    video/mp4, video/3gpp (H.264 + AAC only)  16 MB   (MOV/WebM rejected)
//   audio    aac, amr, mpeg, mp4, ogg (opus)           16 MB
//   document pdf, txt, doc(x), xls(x), ppt(x)         100 MB
// WebP is sticker-only on WhatsApp, so it is never sent as an image.

export const CHAT_MEDIA_BUCKET = 'chat-attachments';

const MB = 1024 * 1024;
// chat-attachments bucket file_size_limit in production is 50 MB.
export const STORAGE_MAX_BYTES = 50 * MB;
export const WA_IMAGE_MAX_BYTES = 5 * MB;
export const WA_VIDEO_MAX_BYTES = 16 * MB;
export const WA_AUDIO_MAX_BYTES = 16 * MB;
// Files at or under this size are uploaded to Meta by the server and sent by
// media ID (synchronous validation by Meta). Larger files are sent by a
// short-lived signed link so the function never shuttles 16-50 MB of bytes
// inside the 10 s Hobby budget.
export const PROVIDER_UPLOAD_MAX_BYTES = 5 * MB;

export type WhatsAppSendAs = 'image' | 'video' | 'audio' | 'document';

interface MimeRule {
  ext: string;
  sendAs: WhatsAppSendAs;
}

const MIME_RULES: Record<string, MimeRule> = {
  'image/jpeg': { ext: 'jpg', sendAs: 'image' },
  'image/png': { ext: 'png', sendAs: 'image' },

  // MOV/WebM are not in Meta's supported list for any message type — rejected
  // with a convert-to-MP4 hint rather than failing later at Meta.
  'video/mp4': { ext: 'mp4', sendAs: 'video' },
  'video/3gpp': { ext: '3gp', sendAs: 'video' },

  'audio/aac': { ext: 'aac', sendAs: 'audio' },
  'audio/amr': { ext: 'amr', sendAs: 'audio' },
  'audio/mpeg': { ext: 'mp3', sendAs: 'audio' },
  'audio/mp4': { ext: 'm4a', sendAs: 'audio' },
  'audio/ogg': { ext: 'ogg', sendAs: 'audio' },

  'application/pdf': { ext: 'pdf', sendAs: 'document' },
  'text/plain': { ext: 'txt', sendAs: 'document' },
  'application/msword': { ext: 'doc', sendAs: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', sendAs: 'document' },
  'application/vnd.ms-excel': { ext: 'xls', sendAs: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', sendAs: 'document' },
  'application/vnd.ms-powerpoint': { ext: 'ppt', sendAs: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', sendAs: 'document' },
};

export const ALLOWED_OUTBOUND_MIME_TYPES = Object.keys(MIME_RULES);

// Browsers report some types inconsistently (or not at all on Android).
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-aac': 'audio/aac',
  'video/3gp': 'video/3gpp',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml', bmp: 'image/bmp',
  mp4: 'video/mp4', m4v: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime', webm: 'video/webm',
  aac: 'audio/aac', amr: 'audio/amr', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg',
  pdf: 'application/pdf', txt: 'text/plain',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Canonical MIME type for a file, falling back to its extension when the browser gave none. */
export function normalizeMimeType(mimeType: string | null | undefined, fileName?: string | null): string {
  let mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  mime = MIME_ALIASES[mime] || mime;
  if (!mime || mime === 'application/octet-stream') {
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
    mime = EXT_TO_MIME[ext] || mime;
  }
  return mime;
}

export type MediaRejectCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE';

export type OutboundMediaPlan =
  | { ok: true; mimeType: string; ext: string; sendAs: WhatsAppSendAs }
  | { ok: false; code: MediaRejectCode; message: string };

/**
 * Decide whether a file can be sent and how WhatsApp will receive it.
 * `mimeType` must already be normalized. Images larger than 5 MB or in a
 * non-WhatsApp format are rejected here — the composer re-encodes them to JPEG
 * before they ever reach this check (see client-image.ts).
 */
export function planOutboundMedia(mimeType: string, size: number): OutboundMediaPlan {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, code: 'EMPTY_FILE', message: 'This file is empty or unreadable.' };
  }
  const rule = MIME_RULES[mimeType];
  if (!rule && mimeType.startsWith('video/')) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'WhatsApp only accepts MP4 or 3GP videos. Convert this video to MP4 and try again.',
    };
  }
  if (!rule) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'WhatsApp can’t receive this file type. Send a JPG/PNG photo, an MP4 video, audio, or a PDF/Office document.',
    };
  }
  if (size > STORAGE_MAX_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: 'Files must be 50 MB or smaller.' };
  }
  if (rule.sendAs === 'image' && size > WA_IMAGE_MAX_BYTES) {
    return { ok: false, code: 'IMAGE_TOO_LARGE', message: 'Photos must be 5 MB or smaller.' };
  }
  if (rule.sendAs === 'video' && size > WA_VIDEO_MAX_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: 'WhatsApp videos must be 16 MB or smaller. Trim or compress the video and try again.' };
  }
  if (rule.sendAs === 'audio' && size > WA_AUDIO_MAX_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: 'Audio files must be 16 MB or smaller.' };
  }
  return { ok: true, mimeType, ext: rule.ext, sendAs: rule.sendAs };
}

/** Human noun for toasts and failure text: "Photo couldn't be sent". */
export function mediaLabel(sendAs: string | null | undefined): string {
  switch (sendAs) {
    case 'image': return 'Photo';
    case 'video': return 'Video';
    case 'audio':
    case 'voice': return 'Audio';
    default: return 'File';
  }
}

// ── Content sniffing ─────────────────────────────────────────────────────────
// Never trust file.type or the extension: a renamed executable must not pass as
// image.jpg. We read the leading bytes of the object that is actually in storage.

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

const DANGEROUS_SIGNATURES: number[][] = [
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x4d, 0x5a],             // MZ (Windows PE)
  [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat / Java class
  [0x23, 0x21],             // #! shebang
];

const DANGEROUS_TEXT = /^\s*(<\?php|<script|<!doctype html|<html|<svg)/i;

export function hasDangerousSignature(bytes: Uint8Array): boolean {
  if (DANGEROUS_SIGNATURES.some(sig => startsWith(bytes, sig))) return true;
  return DANGEROUS_TEXT.test(ascii(bytes, 0, 64));
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isIsoBmff(bytes: Uint8Array): boolean {
  return ascii(bytes, 4, 8) === 'ftyp';
}

function isoBrand(bytes: Uint8Array): string {
  return ascii(bytes, 8, 12);
}

/**
 * True when the leading bytes are consistent with the claimed MIME type.
 * `bytes` should hold at least the first ~64 bytes of the file.
 */
export function bytesMatchMimeType(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 4) return false;
  if (hasDangerousSignature(bytes)) return false;

  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'video/mp4':
    case 'audio/mp4':
      // Any ISO-BMFF brand (isom, mp41, mp42, avc1, M4A , M4V , dash…) except QuickTime.
      return isIsoBmff(bytes) && isoBrand(bytes) !== 'qt  ';
    case 'video/3gpp':
      return isIsoBmff(bytes) && /^3g/.test(isoBrand(bytes));
    case 'audio/ogg':
      return ascii(bytes, 0, 4) === 'OggS';
    case 'audio/mpeg':
      return ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case 'audio/aac':
      return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0; // ADTS sync word, layer 0
    case 'audio/amr':
      return ascii(bytes, 0, 5) === '#!AMR';
    case 'application/pdf':
      return ascii(bytes, 0, 5) === '%PDF-';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(bytes, ZIP);
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return startsWith(bytes, OLE);
    case 'text/plain':
      // No signature — require no NUL bytes in the sampled prefix (binary files
      // renamed to .txt nearly always contain them).
      return !bytes.includes(0);
    default:
      return false;
  }
}

// ── Storage paths ────────────────────────────────────────────────────────────
// {tenantId}/{conversationId}/{uuid}.{ext}. The random UUID makes object URLs
// unguessable (the old path embedded a timestamp and the original filename),
// and the strict parser below means a client can only ever point the send
// endpoint at an object inside its own tenant + conversation prefix.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function buildChatMediaPath(tenantId: string, conversationId: string, objectId: string, ext: string): string {
  return `${tenantId}/${conversationId}/${objectId}.${ext}`;
}

/** Returns the extension when `path` is a well-formed object path owned by this tenant + conversation. */
export function parseOwnedChatMediaPath(path: unknown, tenantId: string, conversationId: string): { ext: string } | null {
  if (typeof path !== 'string' || path.length > 200) return null;
  const re = new RegExp(`^(${UUID})/(${UUID})/(${UUID})\\.([a-z0-9]{2,5})$`, 'i');
  const m = path.match(re);
  if (!m) return null;
  if (m[1].toLowerCase() !== tenantId.toLowerCase()) return null;
  if (m[2].toLowerCase() !== conversationId.toLowerCase()) return null;
  return { ext: m[4].toLowerCase() };
}

/** Filename shown to the customer on document messages; strips paths and control characters. */
export function sanitizeDisplayFileName(name: unknown, fallbackExt: string): string {
  const raw = typeof name === 'string' ? name : '';
  const base = raw.split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return cleaned || `file.${fallbackExt}`;
}

// ── Operator-facing failure text ─────────────────────────────────────────────

export const SESSION_EXPIRED = 'SESSION_EXPIRED';

/** Friendly reason for a provider error code (Meta Cloud API). */
export function friendlyProviderReason(code: number | undefined, opts: { rateLimited?: boolean } = {}): string {
  if (opts.rateLimited) return 'WhatsApp is rate-limiting this number. Try again in a minute.';
  switch (code) {
    case 131053:
    case 131052:
      return 'WhatsApp couldn’t process this file. Use a JPG/PNG photo or an MP4 (H.264) video.';
    case 100:
    case 131008:
    case 131009:
      return 'WhatsApp rejected this file.';
    case 190:
      return 'Your WhatsApp connection has expired. Reconnect WhatsApp in Settings.';
    case 131026:
      return 'This number can’t receive WhatsApp messages.';
    case 131051:
      return 'WhatsApp doesn’t support this message type.';
    case 133010:
      return 'Your WhatsApp number isn’t fully registered on the Cloud API.';
    default:
      return 'WhatsApp didn’t accept the file. Please try again.';
  }
}

/** Text under a failed media bubble. */
export function describeMediaFailure(sendAs: string | null | undefined, errorMessage: string | null | undefined): string {
  const label = mediaLabel(sendAs);
  if (errorMessage === SESSION_EXPIRED) {
    return `${label} couldn’t be sent — the 24-hour chat window has closed. Send a template first.`;
  }
  return errorMessage ? `${label} couldn’t be sent. ${errorMessage}` : `${label} couldn’t be sent. Please try again.`;
}

// A 'pending' media row whose send attempt started longer ago than this was
// almost certainly killed by the function timeout — it may be retried.
export const STALE_PENDING_MS = 90_000;
