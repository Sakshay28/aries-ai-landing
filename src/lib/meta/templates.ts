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
  return withRetry(async () => {
    const res = await fetch(`${META_BASE}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (json as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`;
      throw new Error(errMsg);
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
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(input.headerType) && input.headerMediaUrl) {
    const format = input.headerType; // 'IMAGE' | 'VIDEO' | 'DOCUMENT'
    components.push({
      type: 'HEADER',
      format,
      example: {
        header_handle: [input.headerMediaUrl],
      },
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
