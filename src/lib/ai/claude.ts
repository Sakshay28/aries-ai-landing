// ═══════════════════════════════════════════════════════════
// Claude (Anthropic) client — the platform's text + vision model.
// ═══════════════════════════════════════════════════════════
// Replaced Gemini/Vertex for chat replies on 2026-11-23 after the
// Vertex project's billing was disabled (every reply had been the
// offline fallback since 2026-11-03). Embeddings (rag.ts) and video
// analysis stay on Google: Claude has no embeddings endpoint and does
// not accept video.
//
// Config (env):
//   ANTHROPIC_API_KEY   required
//   CLAUDE_MODEL        default claude-sonnet-5-5 (chosen 2026-11-23 for speed +
//                       rule-following at half Opus's price; claude-opus-5-5 is the
//                       most capable, claude-haiku-5-5 the fastest/cheapest)
//   CLAUDE_CHAT_EFFORT  default low (low | medium | high) — WhatsApp replies
// ═══════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = (process.env.CLAUDE_MODEL || '').trim() || 'claude-sonnet-5-5';

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export function chatEffort(): ClaudeEffort {
  const e = (process.env.CLAUDE_CHAT_EFFORT || '').trim();
  return e === 'medium' || e === 'high' ? e : 'low';
}

let _client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!_client) {
    // One retry: callers sit inside a ~10s WhatsApp reply budget and have
    // their own offline fallback, so long retry ladders only add latency.
    _client = new Anthropic({ maxRetries: 1 });
  }
  return _client;
}

export interface ClaudeCallOptions {
  /** Plain string, or blocks (e.g. a cached stable block + an uncached volatile block). */
  system?: string | Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens?: number;
  effort?: ClaudeEffort;
  /** Per-request HTTP timeout (ms). */
  timeoutMs?: number;
  /** When set, the reply is constrained to this JSON schema (structured outputs). */
  jsonSchema?: Record<string, unknown>;
}

export interface ClaudeCallResult {
  text: string;
  /** true when the model (and its fallback chain) declined — `text` may be empty or off-schema. */
  refused: boolean;
  stopReason: string | null;
  model: string;
  /** All tokens billed for this call (uncached + cache write + cache read + output). */
  totalTokens: number;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

/**
 * One Messages API call. Server-side refusal fallbacks are on ("default"):
 * if the model declines for safety reasons the API re-runs the request on
 * its default fallback model inside the same call (no-op on models without
 * fallbacks).
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const response = await getClaude().beta.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: opts.messages,
      output_config: {
        effort: opts.effort ?? 'low',
        ...(opts.jsonSchema ? { format: { type: 'json_schema' as const, schema: opts.jsonSchema } } : {}),
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const u = response.usage;
  const usage = {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };

  return {
    text,
    refused: response.stop_reason === 'refusal',
    stopReason: response.stop_reason ?? null,
    model: response.model,
    totalTokens: usage.input + usage.output + usage.cacheRead + usage.cacheWrite,
    usage,
  };
}

/** Convenience: single user prompt → plain text. Throws on empty output or refusal. */
export async function claudeText(
  prompt: string,
  opts: Omit<ClaudeCallOptions, 'messages'> = {},
): Promise<string> {
  const r = await callClaude({ ...opts, messages: [{ role: 'user', content: prompt }] });
  if (r.refused || !r.text) throw new Error(r.refused ? 'Claude declined the request' : 'Empty Claude response');
  return r.text;
}

/**
 * Claude requires the conversation to start with a user turn and rejects
 * empty text blocks. WhatsApp histories can open with a business message
 * (template, broadcast, flow) and contain media-only turns, so normalise.
 */
export function toClaudeMessages(
  history: { role: 'user' | 'assistant'; content: string }[],
  latestUserMessage: string,
): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history) {
    const content = (m.content || '').trim() || '[media]';
    msgs.push({ role: m.role, content });
  }
  msgs.push({ role: 'user', content: (latestUserMessage || '').trim() || '[media]' });
  if (msgs[0].role !== 'user') {
    msgs.unshift({ role: 'user', content: '[Conversation started with a message from the business]' });
  }
  return msgs;
}

/** Anthropic accepts these image types inline. */
export const CLAUDE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
