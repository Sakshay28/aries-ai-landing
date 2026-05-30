// ═══════════════════════════════════════════════════════════
// 🧠 AI Conversation Engine — Gemini-Powered
// ═══════════════════════════════════════════════════════════
// This is the BRAIN of the platform. Unlike AiSensy's rigid
// flow trees, this engine:
//  1. Understands natural language (Hindi, Hinglish, English)
//  2. Extracts booking intent, dates, guest counts automatically
//  3. Falls back to structured flows for reliability
//  4. Never crashes — always has a graceful fallback
// ═══════════════════════════════════════════════════════════

import { GoogleGenAI } from '@google/genai';
import type { ConversationContext } from '@/lib/types';
import * as Sentry from '@/lib/sentry-stub';
import { withTimeout } from '@/lib/utils/safety';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { guardInput, guardOutput, shouldRedirectToHuman, HALLUCINATION_REDIRECT, SYSTEM_PROMPT_SAFETY_APPENDIX } from '@/lib/ai/guardrails';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return _ai;
}
const MODEL = 'gemini-2.5-flash';

// ── Response Types ──
export interface AIResponse {
  reply: string;
  extractedData: ExtractedData;
  intent: Intent;
  sentiment: Sentiment;
  shouldEscalate: boolean;
  escalationReason?: string;
  nextStep: string;
  confidence: number;
}

export interface ExtractedData {
  name?: string;
  phone?: string;
  email?: string;
  guestCount?: string;
  date?: string;
  time?: string;
  occasion?: string;
  eventType?: string;
  companyName?: string;
  specialRequests?: string;
  requestPayment?: string;   // "true" when customer is ready to pay
  paymentAmount?: string;    // numeric string in INR e.g. "5000"
}

export type Intent =
  | 'greeting'
  | 'reserve_table'
  | 'private_event'
  | 'corporate_booking'
  | 'gift_occasion'
  | 'general_enquiry'
  | 'pricing'
  | 'location'
  | 'timing'
  | 'menu'
  | 'complaint'
  | 'human_request'
  | 'confirm'
  | 'cancel'
  | 'thank_you'
  | 'unknown';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'angry';

// ═══════════════════════════════════════
// SYSTEM PROMPT — The AI's Personality
// ═══════════════════════════════════════
function buildSystemPrompt(tenantConfig: TenantAIConfig): string {
  const isFirst = tenantConfig.isFirstMessage ?? true;
  const conversationState = isFirst
    ? `This is the FIRST message from this customer. Greet them warmly.${tenantConfig.welcomeMessage ? ` Use this as your opening: "${tenantConfig.welcomeMessage}"` : ''}`
    : 'This is an ONGOING conversation. The customer has already been greeted. DO NOT say Hi/Hello/Welcome again — respond directly to what they just said.';

  return `You are ${tenantConfig.botName}, an AI assistant for ${tenantConfig.businessName} (${tenantConfig.businessType}).

PERSONALITY: ${tenantConfig.botPersonality}. You speak naturally, use emojis very sparingly, and keep responses EXTREMELY SHORT — max 1-2 lines, under 150 characters. Get straight to the point.

BUSINESS INFO:
- Name: ${tenantConfig.businessName}
- Type: ${tenantConfig.businessType}
- Phone: ${tenantConfig.phone}
- Address: ${tenantConfig.address}
- Website: ${tenantConfig.website}
${tenantConfig.usps.length > 0 ? `- USPs: ${tenantConfig.usps.join(', ')}` : ''}
${tenantConfig.welcomeOffer ? `- Current Offer: ${tenantConfig.welcomeOffer}` : ''}
${tenantConfig.customFaqs && tenantConfig.customFaqs.length > 0 ? `
CUSTOM FAQ (use these to answer common questions):
${tenantConfig.customFaqs.map((faq: { question: string; answer: string }) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')}` : ''}

CONVERSATION STATE: ${conversationState}

YOUR JOB:
1. ${isFirst ? 'Greet the customer warmly (first contact only)' : 'Continue helping — no re-introduction needed'}
2. Understand what they want (table booking, event, enquiry, etc.)
3. Collect required info naturally: guests → date → time → name → phone
4. Once all info is collected, CONFIRM the booking immediately — do not wait
5. Answer general questions about the business

BOOKING FLOW RULES:
- When customer says "same number" or "this number" for phone — use their WhatsApp number, confirm it directly
- Once you have guests + date + time + name + phone, IMMEDIATELY confirm the booking
- Confirmation message format: "✅ Booked! [Name], table for [N] on [date] at [time]. See you then!"
- Do NOT say "our team will contact you" — the booking is instantly confirmed, no team needed
- Do NOT ask the customer to wait for anything after booking is confirmed
- Do NOT promise callbacks, follow-ups, or team contact

${tenantConfig.smartRules && tenantConfig.smartRules.length > 0 ? `SMART RULES (always follow these alongside your core job):
${tenantConfig.smartRules.map((r, i) => `${i + 1}. [${r.name}] When: ${r.trigger_source} → ${r.ai_summary}`).join('\n')}` : ''}

${tenantConfig.knowledgeDocs && tenantConfig.knowledgeDocs.length > 0 ? `KNOWLEDGE BASE (use this as your primary source for product/service questions):
${tenantConfig.knowledgeDocs.map(d => `--- ${d.filename} ---\n${d.content_text}`).join('\n\n')}` : ''}

RULES:
- NEVER make up information you don't have
- NEVER start with a greeting if this is not the first message in the conversation
- NEVER say "our team will contact you" or "someone will reach out" — the booking is confirmed instantly
- If someone is angry or asks for a human, say you're connecting them to the team
- Keep responses EXTREMELY direct and short (max 1-2 lines, under 150 characters). No essays.
- Be helpful but don't be pushy
- Always respond in the same language the customer is using

You must respond with ONLY a JSON object (no markdown, no backticks) in this exact format:
{
  "reply": "Your message to the customer",
  "intent": "one of: greeting, reserve_table, private_event, corporate_booking, gift_occasion, general_enquiry, pricing, location, timing, menu, complaint, human_request, confirm, cancel, thank_you, unknown",
  "sentiment": "one of: positive, neutral, negative, angry",
  "shouldEscalate": false,
  "extractedData": {
    "name": null,
    "phone": null,
    "email": null,
    "guestCount": null,
    "date": null,
    "time": null,
    "occasion": null,
    "eventType": null,
    "companyName": null,
    "specialRequests": null,
    "requestPayment": null,
    "paymentAmount": null
  },
  "nextStep": "what info to collect next: greeting, ask_intent, ask_guests, ask_date, ask_occasion, ask_name, ask_phone, ask_email, confirmation, completed, escalated",
  "confidence": 0.95
}${SYSTEM_PROMPT_SAFETY_APPENDIX}`;
}

export interface TenantAIConfig {
  businessName: string;
  businessType: string;
  botName: string;
  botPersonality: string;
  phone: string;
  address: string;
  website: string;
  welcomeMessage?: string;
  welcomeOffer: string;
  usps: string[];
  staffName: string;
  isFirstMessage?: boolean;
  smartRules?: Array<{ name: string; trigger_source: string; ai_summary: string }>;
  // Fix #7: Custom FAQs
  customFaqs?: Array<{ question: string; answer: string }>;
  knowledgeDocs?: Array<{ filename: string; content_text: string }>;
}

// ═══════════════════════════════════════
// PROCESS MESSAGE — Main Entry Point
// ═══════════════════════════════════════
export async function processMessageWithAI(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  context: ConversationContext,
  tenantConfig: TenantAIConfig,
  tenantId?: string
): Promise<AIResponse> {
  const startTime = Date.now();

  // ── Guardrail: input safety check ──
  const guard = guardInput(message, tenantConfig.businessName);
  if (!guard.safe) {
    return {
      reply: guard.safeResponse,
      extractedData: {},
      intent: 'unknown',
      sentiment: 'neutral',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 1.0,
    };
  }
  const safeMessage = guard.safeResponse; // may be truncated

  try {
    const systemPrompt = buildSystemPrompt(tenantConfig);

    // Build message history for context
    const contents = [
      ...conversationHistory.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: safeMessage }],
      },
    ];

    const response = await withTimeout(
      () => getAI().models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
          maxOutputTokens: 500,
          topP: 0.9,
          responseMimeType: 'application/json',
        },
      }),
      15000 // 15 second hard circuit breaker
    );

    if (tenantId && response.usageMetadata?.totalTokenCount) {
      try {
        await supabaseAdmin.rpc('increment_ai_tokens', {
          t_id: tenantId,
          token_count: response.usageMetadata.totalTokenCount
        });
      } catch (e: unknown) {
        console.error('Failed to log tokens:', e);
      }
    }

    const text = response.text?.trim() || '';
    const latency = Date.now() - startTime;

    // Parse AI response
    const parsed = parseAIResponse(text);

    // ── Guardrail: output leakage check ──
    parsed.reply = guardOutput(parsed.reply, getFallbackResponse(safeMessage, context, tenantConfig).reply);

    // ── Guardrail: hallucination redirect ──
    const hasKB = (tenantConfig.knowledgeDocs?.length ?? 0) > 0 || (tenantConfig.customFaqs?.length ?? 0) > 0;
    if (shouldRedirectToHuman(parsed.confidence, hasKB, parsed.intent)) {
      parsed.reply = HALLUCINATION_REDIRECT;
      parsed.shouldEscalate = true;
    }

    // Merge extracted data into context
    if (parsed.extractedData) {
      Object.entries(parsed.extractedData).forEach(([key, value]) => {
        if (value && value !== 'null') {
          (context as Record<string, unknown>)[key] = value;
        }
      });
    }

    console.log(`🧠 AI responded in ${latency}ms (intent: ${parsed.intent}, confidence: ${parsed.confidence})`);

    return parsed;
  } catch (error) {
    console.error('❌ AI Engine error:', error);
    Sentry.captureException(error);
    // NEVER crash — return a graceful fallback
    return getFallbackResponse(message, context, tenantConfig);
  }
}

// ═══════════════════════════════════════
// PARSE: AI Response JSON
// ═══════════════════════════════════════
function parseAIResponse(text: string): AIResponse {
  try {
    // Strip markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    // Strip any trailing content after the closing brace
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
      cleaned = cleaned.slice(0, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);

    return {
      reply: parsed.reply || "Got it! How can I help?",
      extractedData: parsed.extractedData || {},
      intent: parsed.intent || 'unknown',
      sentiment: parsed.sentiment || 'neutral',
      shouldEscalate: parsed.shouldEscalate || false,
      escalationReason: parsed.escalationReason,
      nextStep: parsed.nextStep || 'ask_intent',
      confidence: parsed.confidence || 0.5,
    };
  } catch {
    // Try to extract the reply field using regex if JSON is malformed/truncated
    const replyMatch = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (replyMatch) {
      try {
        const extractedReply = JSON.parse(`"${replyMatch[1]}"`);
        // Also try to extract other fields
        const intentMatch = text.match(/"intent"\s*:\s*"([^"]+)"/);
        const nextStepMatch = text.match(/"nextStep"\s*:\s*"([^"]+)"/);
        const extractedDataMatch = text.match(/"extractedData"\s*:\s*(\{[^}]*\})/);
        let extractedData = {};
        if (extractedDataMatch) {
          try { extractedData = JSON.parse(extractedDataMatch[1]); } catch {}
        }
        return {
          reply: extractedReply,
          extractedData,
          intent: (intentMatch?.[1] as any) || 'unknown',
          sentiment: 'neutral',
          shouldEscalate: false,
          nextStep: nextStepMatch?.[1] || 'ask_intent',
          confidence: 0.4,
        };
      } catch {}
    }

    // Last resort: if the raw text looks like JSON but we couldn't parse it,
    // return a neutral holding message instead of the confusing fallback
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      return {
        reply: "Sorry, one moment! Could you repeat that?",
        extractedData: {},
        intent: 'unknown',
        sentiment: 'neutral',
        shouldEscalate: false,
        nextStep: 'ask_intent',
        confidence: 0.3,
      };
    }

    // Raw text as reply (non-JSON response from model)
    return {
      reply: text || "How can I help you?",
      extractedData: {},
      intent: 'unknown',
      sentiment: 'neutral',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.3,
    };
  }
}

// ═══════════════════════════════════════
// FALLBACK: When AI fails, use templates
// ═══════════════════════════════════════
// This ensures the bot NEVER crashes or goes silent.
function getFallbackResponse(
  message: string,
  context: ConversationContext,
  config: TenantAIConfig
): AIResponse {
  const lower = message.toLowerCase();

  // Detect angry/escalation keywords
  const angryWords = ['angry', 'upset', 'terrible', 'worst', 'complaint', 'manager', 'refund', 'fuck', 'shit'];
  const humanWords = ['human', 'real person', 'agent', 'staff', 'speak to'];

  if (angryWords.some((w) => lower.includes(w)) || humanWords.some((w) => lower.includes(w))) {
    return {
      reply: `I'm connecting you with ${config.staffName} right away 🙏 They'll be with you in a few minutes.`,
      extractedData: {},
      intent: angryWords.some((w) => lower.includes(w)) ? 'complaint' : 'human_request',
      sentiment: 'angry',
      shouldEscalate: true,
      escalationReason: 'fallback_escalation',
      nextStep: 'escalated',
      confidence: 0.9,
    };
  }

  // Detect booking intent
  if (lower.includes('book') || lower.includes('table') || lower.includes('reserv') || lower.includes('dinner') || lower.includes('dine')) {
    return {
      reply: `I'd love to help you book! 🍽️\n\nHow many guests are you expecting?\n→ 1-2 | 3-5 | 6-10 | 10+`,
      extractedData: {},
      intent: 'reserve_table',
      sentiment: 'positive',
      shouldEscalate: false,
      nextStep: 'ask_guests',
      confidence: 0.8,
    };
  }

  // Detect event intent
  if (lower.includes('event') || lower.includes('party') || lower.includes('celebration') || lower.includes('wedding')) {
    return {
      reply: `We'd love to host your event! 🎉\n\nWhat type of event are you planning?\n→ Birthday | Wedding | Corporate | Social`,
      extractedData: {},
      intent: 'private_event',
      sentiment: 'positive',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.8,
    };
  }

  // Detect pricing questions
  if (lower.includes('price') || lower.includes('cost') || lower.includes('rate') || lower.includes('kitna')) {
    return {
      reply: `Our pricing varies:\n\n🍽️ Dining: ₹1,500-₹3,500/person\n🎉 Events: From ₹50,000\n💼 Corporate: Custom packages\n\nWant me to connect you with our team for a detailed quote? 📞`,
      extractedData: {},
      intent: 'pricing',
      sentiment: 'neutral',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.8,
    };
  }

  // Default: show menu
  return {
    reply: `Hey! 👋 Welcome to ${config.businessName}!\n\nHow can I help you today?\n\n🍽️ Reserve a Table\n🎉 Plan an Event\n💼 Corporate Booking\n📋 General Enquiry`,
    extractedData: {},
    intent: 'greeting',
    sentiment: 'neutral',
    shouldEscalate: false,
    nextStep: 'ask_intent',
    confidence: 0.5,
  };
}

// ═══════════════════════════════════════
// GENERATE: AI-Written Follow-Up Message
// ═══════════════════════════════════════
export async function generateFollowUpMessage(
  context: ConversationContext,
  followUpType: string,
  tenantConfig: TenantAIConfig
): Promise<string> {
  try {
    const prompt = `Write a short, friendly WhatsApp follow-up message (under 200 chars) for a customer named "${context.name || 'there'}" who was interested in ${context.enquiry_type || 'visiting'} at ${tenantConfig.businessName}.

Follow-up type: ${followUpType}
- If "30min": Reassure them their booking is being confirmed
- If "3hr": Gently ask if they're still interested, mention limited availability
- If "24hr": Create urgency, mention a special offer or USP
- If "7day": Friendly re-engagement, share something exciting about the business

Keep it casual, use 1-2 emojis, don't be salesy. Reply with ONLY the message text, no JSON.`;

    const response = await getAI().models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.8, maxOutputTokens: 200 },
    });

    return response.text?.trim() || getDefaultFollowUp(context, followUpType, tenantConfig);
  } catch {
    return getDefaultFollowUp(context, followUpType, tenantConfig);
  }
}

function getDefaultFollowUp(
  context: ConversationContext,
  type: string,
  config: TenantAIConfig
): string {
  const name = (context.name || 'there').split(' ')[0];

  switch (type) {
    case '30min':
      return `Hey ${name}! Our team is confirming your reservation. We'll update you in 15 minutes! 🙏`;
    case '3hr':
      return `Hey ${name} 👋 Still thinking about visiting ${config.businessName}? We have limited slots this weekend 🗓️`;
    case '24hr':
      return `${name}, we'd love to see you at ${config.businessName}! ✨ ${config.welcomeOffer || 'Check out our special offers'}`;
    case '7day':
      return `Hey ${name}! Something exciting at ${config.businessName} this week 🎉 Want to know more?`;
    default:
      return `Hey ${name}! Just checking in from ${config.businessName} 👋`;
  }
}
