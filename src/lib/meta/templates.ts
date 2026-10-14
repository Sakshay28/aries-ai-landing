// ─────────────────────────────────────────────
// Meta WhatsApp Template CRUD Service
// ─────────────────────────────────────────────
// Handles all template management API calls to Meta Graph API.
// Decoupled from the general service.ts to keep concerns clean.

const META_BASE = 'https://graph.facebook.com/v21.0';

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Retry: skip 4xx, exponential backoff on 5xx/network errors ──
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (/status 4\d\d|error 4\d\d/.test(msg) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw new Error('Meta API: max retries exceeded');
}

// ── List all templates for a WABA ──────────────
export async function listMetaTemplates(
  accessToken: string,
  wabaId: string,
  limit = 100,
  after?: string
): Promise<{ templates: Record<string, unknown>[]; nextCursor?: string }> {
  return withRetry(async () => {
    const url = new URL(`${META_BASE}/${wabaId}/message_templates`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fields', 'id,name,status,category,language,components,rejected_reason,quality_score');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url.toString(), {
      headers: authHeader(accessToken),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Meta list templates error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const json = await res.json();
    return {
      templates: (json.data as Record<string, unknown>[]) ?? [],
      nextCursor: json.paging?.cursors?.after,
    };
  });
}

// ── Cache for Meta App IDs by access token prefix (reduces duplicate /app lookups) ──
const appIdCache = new Map<string, string>();

export interface ResumableUploadMediaInput {
  url?: string;
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
}

/**
 * Uploads a media asset (image/video/document) to Meta via the Resumable Upload API
 * and returns the upload handle `h` required by Meta Graph API for template headers.
 */
export async function uploadMediaToMetaResumable(
  accessToken: string,
  media: ResumableUploadMediaInput
): Promise<string> {
  let buffer = media.buffer;
  let mimeType = media.mimeType;
  let fileName = media.fileName || 'header_sample';

  // 1. Download buffer if URL provided
  if (!buffer && media.url) {
    const res = await fetch(media.url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) {
      throw new Error(`Failed to download sample media for Meta approval (${res.status} ${res.statusText})`);
    }
    const contentType = res.headers.get('content-type');
    if (!mimeType && contentType) {
      mimeType = contentType.split(';')[0].trim().toLowerCase();
    }
    buffer = Buffer.from(await res.arrayBuffer());

    if (!media.fileName) {
      try {
        const u = new URL(media.url);
        const base = u.pathname.split('/').pop();
        if (base) fileName = base;
      } catch {
        // keep fallback
      }
    }
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Template sample media file is empty. Please upload a valid image.');
  }

  // Normalize / infer MIME type
  if (mimeType) {
    mimeType = mimeType.split(';')[0].trim().toLowerCase();
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  } else {
    if (/\.jpe?g$/i.test(fileName)) mimeType = 'image/jpeg';
    else if (/\.png$/i.test(fileName)) mimeType = 'image/png';
    else if (/\.mp4$/i.test(fileName)) mimeType = 'video/mp4';
    else if (/\.pdf$/i.test(fileName)) mimeType = 'application/pdf';
    else if (buffer[0] === 0xff && buffer[1] === 0xd8) mimeType = 'image/jpeg';
    else if (buffer[0] === 0x89 && buffer[1] === 0x50) mimeType = 'image/png';
    else mimeType = 'image/jpeg';
  }

  // 2. Discover Meta App ID
  const cacheKey = accessToken.slice(-16);
  let appId = appIdCache.get(cacheKey) || process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) {
    try {
      const appRes = await fetch(`${META_BASE}/app?access_token=${accessToken}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (appRes.ok) {
        const appJson = (await appRes.json()) as { id?: string };
        if (appJson.id) {
          appId = appJson.id;
          appIdCache.set(cacheKey, appId);
        }
      }
    } catch (e) {
      console.warn('Failed to resolve Meta App ID from token:', (e as Error).message);
    }
  }

  if (!appId) {
    throw new Error('Unable to resolve Meta App ID required for media upload.');
  }

  // 3. Create resumable upload session on Meta
  const sessionUrl = new URL(`${META_BASE}/${appId}/uploads`);
  sessionUrl.searchParams.set('file_length', String(buffer.length));
  sessionUrl.searchParams.set('file_type', mimeType);
  sessionUrl.searchParams.set('file_name', fileName);
  sessionUrl.searchParams.set('access_token', accessToken);

  const sessionRes = await fetch(sessionUrl.toString(), {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
  });

  const sessionJson = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !(sessionJson as { id?: string }).id) {
    const errDetail =
      (sessionJson as { error?: { message?: string } })?.error?.message || `Status ${sessionRes.status}`;
    throw new Error(`Failed to create Meta upload session: ${errDetail}`);
  }

  const uploadSessionId = (sessionJson as { id: string }).id;

  // 4. Upload binary bytes to Meta
  const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${uploadSessionId}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(35000),
  });

  const uploadJson = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !(uploadJson as { h?: string }).h) {
    const errDetail =
      (uploadJson as { error?: { message?: string } })?.error?.message || `Status ${uploadRes.status}`;
    throw new Error(`Failed to transfer media to Meta: ${errDetail}`);
  }

  return (uploadJson as { h: string }).h;
}

// ── Create a new template ──────────────────────
export interface MetaCreateTemplatePayload {
  name: string;
  category: string;
  language: string;
  components: unknown[];
  allow_category_change?: boolean;
}

export async function createMetaTemplate(
  accessToken: string,
  wabaId: string,
  payload: MetaCreateTemplatePayload
): Promise<{ id: string; status: string }> {
  // Pre-process components: convert any media header URLs to valid Meta Resumable Upload handles
  const processedComponents = await Promise.all(
    (payload.components || []).map(async (comp) => {
      const c = comp as Record<string, unknown>;
      if (c && c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format as string)) {
        const example = (c.example || {}) as Record<string, unknown>;
        const handles = (example.header_handle as string[] | undefined) || [];
        const firstHandle = handles[0];

        // If handle is an HTTP(S) URL, upload to Meta via Resumable Upload API to obtain a valid handle
        if (firstHandle && (firstHandle.startsWith('http://') || firstHandle.startsWith('https://'))) {
          const handle = await uploadMediaToMetaResumable(accessToken, {
            url: firstHandle,
            fileName: `${(c.format as string).toLowerCase()}_sample`,
          });
          return {
            ...c,
            example: {
              ...example,
              header_handle: [handle],
            },
          };
        }

        // If no handle provided at all for media header, throw a clear error before Meta rejects with 2388273
        if (!firstHandle) {
          throw new Error(
            `A sample ${String(c.format).toLowerCase()} file is required for ${c.format} headers. Please upload a media file before submitting.`
          );
        }
      }
      return c;
    })
  );

  const finalPayload: MetaCreateTemplatePayload = {
    ...payload,
    components: processedComponents,
  };

  return withRetry(async () => {
    const res = await fetch(`${META_BASE}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(finalPayload),
      signal: AbortSignal.timeout(15000),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (json as { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } }).error;

      // Self-healing: if template already exists in this language (subcode 2388024), update it instead!
      if (err?.error_subcode === 2388024 || /already exists/i.test(err?.message || '')) {
        try {
          const listRes = await fetch(`${META_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(finalPayload.name)}`, {
            headers: authHeader(accessToken),
            signal: AbortSignal.timeout(10000),
          });
          if (listRes.ok) {
            const listJson = await listRes.json();
            const existing = (listJson.data as Array<{ id: string; name: string; language: string }> || []).find(
              (t) => t.name === finalPayload.name && (!finalPayload.language || t.language === finalPayload.language)
            );
            if (existing?.id) {
              const editRes = await fetch(`${META_BASE}/${existing.id}`, {
                method: 'POST',
                headers: authHeader(accessToken),
                body: JSON.stringify({ components: finalPayload.components }),
                signal: AbortSignal.timeout(15000),
              });
              const editJson = await editRes.json();
              if (editRes.ok && (editJson.success || editJson.id)) {
                return {
                  id: existing.id,
                  status: 'PENDING',
                };
              }
            }
          }
        } catch (updateErr) {
          console.warn('Failed to update existing Meta template:', (updateErr as Error).message);
        }
      }

      const detail = [
        err?.message,
        err?.code ? `code ${err.code}` : null,
        err?.error_subcode ? `subcode ${err.error_subcode}` : null,
        err?.error_user_msg,
      ].filter(Boolean).join(' — ');
      throw new Error(detail || `Error ${res.status}`);
    }

    return {
      id: (json as { id: string }).id ?? '',
      status: (json as { status: string }).status ?? 'PENDING',
    };
  });
}

// ── Delete a template by name (Meta requires name-based delete) ──
export async function deleteMetaTemplate(
  accessToken: string,
  wabaId: string,
  templateName: string
): Promise<boolean> {
  const res = await fetch(
    `${META_BASE}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
    {
      method: 'DELETE',
      headers: authHeader(accessToken),
      signal: AbortSignal.timeout(10000),
    }
  );
  return res.ok;
}

// ── Get approval status for a single template ──
export async function getMetaTemplateStatus(
  accessToken: string,
  templateId: string
): Promise<{ status: string; rejectedReason?: string } | null> {
  try {
    const res = await fetch(
      `${META_BASE}/${templateId}?fields=status,rejected_reason`,
      {
        headers: authHeader(accessToken),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const json = await res.json() as { status?: string; rejected_reason?: string };
    return {
      status: json.status ?? 'UNKNOWN',
      rejectedReason: json.rejected_reason ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Build Meta components array from form state ──
// This is the canonical conversion function used by the POST handler.
export interface BuildComponentsInput {
  headerType: string;
  headerText?: string;
  headerMediaUrl?: string;
  body: string;
  footer?: string;
  buttons: {
    type: string;
    text: string;
    url?: string;
    urlType?: string;
    phoneNumber?: string;
  }[];
  variableMap: Record<string, number>;
  category: string;
  otpMode?: string;
  securityRecommendation?: boolean;
  validityPeriod?: number;
}

export function buildMetaComponents(input: BuildComponentsInput): unknown[] {
  const components: unknown[] = [];

  // ── HEADER ──
  if (input.headerType === 'TEXT' && input.headerText) {
    components.push({ type: 'HEADER', format: 'TEXT', text: input.headerText });
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(input.headerType)) {
    const format = input.headerType; // 'IMAGE' | 'VIDEO' | 'DOCUMENT'
    components.push({
      type: 'HEADER',
      format,
      ...(input.headerMediaUrl
        ? {
            example: {
              header_handle: [input.headerMediaUrl],
            },
          }
        : {}),
    });
  }

  // ── BODY ──
  if (input.category === 'AUTHENTICATION') {
    // Auth bodies are managed by Meta — we don't set them
  } else if (input.body) {
    const bodyComp: Record<string, unknown> = {
      type: 'BODY',
      text: input.body,
    };

    // Inject examples for variables
    const maxIdx = Math.max(0, ...Object.values(input.variableMap));
    if (maxIdx > 0) {
      const examples: string[] = [];
      const inverted: Record<number, string> = {};
      for (const [name, idx] of Object.entries(input.variableMap)) {
        inverted[idx] = name;
      }
      for (let i = 1; i <= maxIdx; i++) {
        examples.push(inverted[i] ?? `value${i}`);
      }
      bodyComp.example = { body_text: [examples] };
    }
    components.push(bodyComp);
  }

  // ── FOOTER ──
  if (input.footer && input.category !== 'AUTHENTICATION') {
    components.push({ type: 'FOOTER', text: input.footer });
  }

  // ── BUTTONS ──
  if (input.category === 'AUTHENTICATION') {
    const authButtons: unknown[] = [];
    if (input.otpMode === 'COPY_CODE') {
      authButtons.push({ type: 'OTP', otp_type: 'COPY_CODE' });
    } else if (input.otpMode === 'ONE_TAP') {
      authButtons.push({ type: 'OTP', otp_type: 'ONE_TAP' });
    } else if (input.otpMode === 'ZERO_TAP') {
      authButtons.push({ type: 'OTP', otp_type: 'ZERO_TAP' });
    }

    const authBodyComp: Record<string, unknown> = {
      type: 'BODY',
      add_security_recommendation: input.securityRecommendation ?? true,
    };
    if (input.validityPeriod) {
      authBodyComp.code_expiration_minutes = Math.round(input.validityPeriod / 60);
    }
    components.push(authBodyComp);
    if (authButtons.length > 0) components.push({ type: 'BUTTONS', buttons: authButtons });
  } else if (input.buttons.length > 0) {
    const metaButtons = input.buttons.map((btn) => {
      if (btn.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: btn.text };
      if (btn.type === 'URL') {
        return {
          type: 'URL',
          text: btn.text,
          url: btn.url ?? '',
          ...(btn.urlType === 'DYNAMIC' ? { example: [btn.url ?? ''] } : {}),
        };
      }
      if (btn.type === 'PHONE_NUMBER') {
        return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phoneNumber ?? '' };
      }
      if (btn.type === 'COPY_CODE') {
        return { type: 'COPY_CODE', example: ['SAMPLE123'] };
      }
      return { type: btn.type, text: btn.text };
    });
    components.push({ type: 'BUTTONS', buttons: metaButtons });
  }

  return components;
}
