// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Cost Optimizer (Point 8)
//
// Gemini analysis should NOT run on every trivial message.
// "Thanks", "Ok", "👍", emojis, and reactions waste tokens with zero signal.
//
// This module decides BEFORE enqueueing whether a message warrants AI analysis.
// Conservative: always errs toward running AI rather than missing a signal.
// ═══════════════════════════════════════════════════════════════════════════

export type SkipReason =
  | 'trivial_message'
  | 'cache_hit'
  | 'no_meaningful_change'
  | 'flags_disabled'
  | 'rate_limited';

export interface CostOptimizerResult {
  shouldRunAI: boolean;
  skipReason?: SkipReason;
  priority: number;  // 1 = highest (negotiate/payment), 10 = lowest (greeting)
  explanation: string;
}

// Messages that carry zero new buying information
const TRIVIAL_PATTERNS: RegExp[] = [
  // Single-word acknowledgements
  /^(ok|okay|k|fine|sure|yes|no|yep|nope|yeah|yea|nah|hmm|hm|oh|ah|ohh|ahh|ooh)\.?!?\s*$/i,
  // Thank you variants
  /^(thanks?|thank you|thx|ty|thnx|thank u|dhanyawad|shukriya|shukriyah)\.?!?\s*$/i,
  // Short confirmations
  /^(noted|got it|alright|all right|perfect|great|nice|cool|wow|right|understood|done|received|seen|ok cool|good|got|roger|ack)\.?!?\s*$/i,
  // Emoji-only (allow unicode emoji chars)
  /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27FF}\u{FE0F}\u{200D}👍👎✅❤️🙏😊😄🎉✓✗]+\s*$/u,
  // Single characters or numbers only
  /^[\d\s]{1,4}$/,
  /^.{1,2}$/,
  // WhatsApp reaction emojis
  /^\p{Emoji}+$/u,
];

// Messages that MUST trigger AI regardless of anything else
const HIGH_PRIORITY_PATTERNS: RegExp[] = [
  /\b(discount|negotiate|deal|best price|reduce|lower)\b/i,
  /\b(payment link|send invoice|invoice|quotation|pay now)\b/i,
  /\b(book|confirm|reserve|want to join|karna hai)\b/i,
  /\b(preparation|prepare|what to bring|pack|meeting point)\b/i,
  /\b(urgent|asap|today|immediately|jaldi)\b/i,
  /\b(comparing|vs|another company|competitor)\b/i,
  /\b(not interested|nahi chahiye|cancel|refund)\b/i,
];

// Signals that indicate a meaningful conversation change
const MEANINGFUL_PATTERNS: RegExp[] = [
  /\?/,                                  // any question
  /\b(when|what|how|where|why|which|who)\b/i,
  /\b(price|cost|date|availability|book|group|people|persons?)\b/i,
  /\b(kab|kitna|kahan|kaisa|kya|kaise)\b/i, // Hindi questions
];

export function shouldRunAIAnalysis(
  message: string,
  options: {
    conversationHashChanged: boolean;  // true if conv content differs from last analysis
    aiEnabled: boolean;
    messageCount: number;
    timeSinceLastAnalysis?: number;    // minutes
  }
): CostOptimizerResult {
  const { conversationHashChanged, aiEnabled, messageCount, timeSinceLastAnalysis } = options;
  const text = (message ?? '').trim();

  // Feature flag check
  if (!aiEnabled) {
    return { shouldRunAI: false, skipReason: 'flags_disabled', priority: 10, explanation: 'AI analysis disabled for this tenant' };
  }

  // HIGH PRIORITY: These always trigger AI immediately, no skip
  if (HIGH_PRIORITY_PATTERNS.some(p => p.test(text))) {
    const isPayment = /payment|invoice|pay now|quotation/i.test(text);
    const isNegotiation = /discount|negotiate|deal|best price/i.test(text);
    return {
      shouldRunAI: true,
      priority: isPayment ? 1 : isNegotiation ? 2 : 3,
      explanation: 'High-intent signal detected — immediate AI analysis required',
    };
  }

  // TRIVIAL: Single-word acknowledgements, emojis, short reactions
  if (isTrivialMessage(text)) {
    return {
      shouldRunAI: false,
      skipReason: 'trivial_message',
      priority: 10,
      explanation: `Trivial message ("${text.slice(0, 30)}") carries no buying signal — skip AI`,
    };
  }

  // CACHE HIT: Conversation hasn't changed since last analysis
  if (!conversationHashChanged && timeSinceLastAnalysis !== undefined && timeSinceLastAnalysis < 120) {
    return {
      shouldRunAI: false,
      skipReason: 'cache_hit',
      priority: 10,
      explanation: 'Conversation content unchanged since last analysis — return cached result',
    };
  }

  // MEANINGFUL: Contains questions or known signal keywords
  const isMeaningful = MEANINGFUL_PATTERNS.some(p => p.test(text));
  if (isMeaningful) {
    const priority = messageCount > 20 ? 3 : messageCount > 10 ? 4 : 5;
    return {
      shouldRunAI: true,
      priority,
      explanation: `Meaningful message detected (question or signal keyword) — run AI analysis`,
    };
  }

  // LONG MESSAGE: Detailed message usually carries information
  if (text.length > 80) {
    return {
      shouldRunAI: true,
      priority: 5,
      explanation: `Long message (${text.length} chars) — likely contains substantive information`,
    };
  }

  // FIRST FEW MESSAGES: Always analyze early messages to establish baseline
  if (messageCount <= 5) {
    return {
      shouldRunAI: true,
      priority: 6,
      explanation: 'Early conversation — establish baseline AI profile',
    };
  }

  // DEFAULT: Run AI but at low priority
  return {
    shouldRunAI: true,
    priority: 7,
    explanation: 'Standard message — run AI analysis at normal priority',
  };
}

function isTrivialMessage(text: string): boolean {
  if (!text || text.length < 1) return true;
  if (text.length > 60) return false; // anything this long is not trivial
  return TRIVIAL_PATTERNS.some(p => p.test(text));
}

// Exported for testing
export { isTrivialMessage };
