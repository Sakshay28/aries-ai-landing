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
const MODEL = 'gemini-2.0-flash';

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

// ── Native Persona Instructions mapping ──
const PERSONA_PROMPTS: Record<string, string> = {
  'Premium Fine Dining': 'Speak elegantly, politely, and formally. Reassure the customer about our premium quality, recommend expensive/premium dishes subtly (e.g. Chef specials), encourage reservations, and never sound overly casual.',
  'Fast Casual': 'Speak in a highly energetic, warm, and friendly voice. Focus on speed, convenience, and direct answers. Mention pick-up times, delivery options, or rapid seatings.',
  'Luxury Hospitality': 'Provide ultra-attentive, proactive, and exceptionally hospitable concierge service. Use warm and welcoming language. Anticipate customer needs and make them feel extremely valued and cared for.',
  'Cafe Friendly': 'Maintain a very warm, casual, cheerful, and approachable neighborhood cafe vibe. Speak like a friendly local barista. Keep interactions highly personal and conversational.',
  'Reservations First': 'Focus strictly on booking conversions. Direct the customer efficiently toward completing their reservation (asking for date, time, guest count, name, phone). Keep the conversation highly structured and optimized for securing the table.',
  'Upsell Specialist': 'Actively but politely recommend additions, special promotions, premium seating, beverage pairings, and exclusive menu items. Highlight value and premium offers to maximize customer order size.',
};

function getPersonaInstruction(personality: string): string {
  const p = personality.trim();
  if (p === 'sales_pro') return PERSONA_PROMPTS['Upsell Specialist'];
  if (p === 'concierge') return PERSONA_PROMPTS['Luxury Hospitality'];
  if (p === 'support_hero') return 'Focus on being extremely empathetic, helpful, reassuring, and quick to resolve issues or escalate if needed.';
  
  return PERSONA_PROMPTS[p] || PERSONA_PROMPTS['Premium Fine Dining'];
}

function buildSystemPrompt(tenantConfig: TenantAIConfig): string {
  const isFirst = tenantConfig.isFirstMessage ?? true;
  const conversationState = isFirst
    ? `This is the FIRST message from this customer. Greet them warmly.${tenantConfig.welcomeMessage ? ` Use this as your opening: "${tenantConfig.welcomeMessage}"` : ''}`
    : 'This is an ONGOING conversation. The customer has already been greeted. DO NOT say Hi/Hello/Welcome again — respond directly to what they just said.';

  const personaInstruction = getPersonaInstruction(tenantConfig.botPersonality);

  return `You are ${tenantConfig.botName}, an AI assistant for ${tenantConfig.businessName} (${tenantConfig.businessType}).

PERSONALITY: ${tenantConfig.botPersonality}.
BEHAVIORAL STYLE: ${personaInstruction}. You speak naturally, use emojis very sparingly, and keep responses EXTREMELY SHORT — max 1-2 lines, under 150 characters. Get straight to the point.

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
4. Once all info is collected, CONFIRM the booking immediately — do not wait (Exception: If guest count is 8 or more, or if custom guidelines/knowledge base indicate manager confirmation is required, do NOT confirm. State that manager confirmation is required, note their details, and tell them you will confirm availability shortly).
5. Answer general questions about the business

BOOKING FLOW RULES:
- When customer says "same number" or "this number" for phone — use their WhatsApp number, confirm it directly
- Once you have guests + date + time + name + phone, IMMEDIATELY confirm the booking. (Exception: If guest count is 8 or more, or if custom guidelines/knowledge indicate manager confirmation is required, do NOT confirm. Inform them politely that manager confirmation is required, note all details, and tell them you will confirm shortly).
- Confirmation message format: "✅ Booked! [Name], table for [N] on [date] at [time]. See you then!" (Or for the manager confirmation exception: "Thank you, [Name]. Since this is a reservation for [N] guests, manager confirmation is required. I've noted [date] at [time] using [phone]. We'll confirm availability shortly.")
- Do NOT say "our team will contact you" for standard bookings — the booking is instantly confirmed. For the large group or manager confirmation exception, do state you will confirm shortly.
- Do NOT ask the customer to wait for anything after booking is confirmed
- Do NOT promise callbacks, follow-ups, or team contact

${tenantConfig.smartRules && tenantConfig.smartRules.length > 0 ? `SMART RULES (always follow these alongside your core job):
${tenantConfig.smartRules.map((r, i) => `${i + 1}. [${r.name}] When: ${r.trigger_source} → ${r.ai_summary}`).join('\n')}` : ''}

${tenantConfig.knowledgeDocs && tenantConfig.knowledgeDocs.length > 0 ? `KNOWLEDGE BASE (use this as your primary source for product/service questions):
${tenantConfig.knowledgeDocs.map(d => `--- ${d.filename} ---\n${d.content_text}`).join('\n\n')}` : ''}

RULES:
- NEVER make up information you don't have
- NEVER start with a greeting if this is not the first message in the conversation
- NEVER say "our team will contact you" or "someone will reach out" for standard bookings — the booking is confirmed instantly. (For large groups of 8+ guests or manager confirmation rules, you may state you will confirm shortly).
- If someone is angry or asks for a human, say you're connecting them to the team
- Keep responses EXTREMELY direct and short (max 1-2 lines, under 150 characters). No essays.
- Be helpful but don't be pushy
- Always respond in the same language the customer is using

${(tenantConfig.visitCount ?? 0) >= 2 ? `
RETURNING CUSTOMER: This guest has visited ${tenantConfig.visitCount} times before${tenantConfig.lastVisitDate ? ` (last visit ${tenantConfig.lastVisitDate})` : ''}. Acknowledge them warmly as a valued regular (e.g. "Great to have you back!"). Do NOT overdo it — one short warm line is enough.
` : ''}

${tenantConfig.existingBooking ? `
CUSTOMER'S EXISTING BOOKING (use this for modify/cancel requests):
- Reservation ID: ${tenantConfig.existingBooking.reservationId}
- Date: ${tenantConfig.existingBooking.date}
- Time: ${tenantConfig.existingBooking.time}
- Party size: ${tenantConfig.existingBooking.partySize}
- Status: ${tenantConfig.existingBooking.status}
- Name: ${tenantConfig.existingBooking.customerName}

If the customer wants to CANCEL: confirm their reservation ID and date, then tell them it's been noted and our team will confirm the cancellation. Set shouldEscalate=true so staff can action it.
If the customer wants to MODIFY: collect the new date/time/party size, then confirm the change has been noted for staff to process. Set shouldEscalate=true.
Do NOT confirm a cancellation or modification without staff involvement.
` : ''}

${tenantConfig.ctwaContext ? `
# META ADS CAMPAIGN CONTEXT (Important — read carefully):
${tenantConfig.ctwaContext}
` : ''}
${tenantConfig.systemPrompt ? `
# STAFF_GUIDELINES (Always follow these custom operational instructions alongside core rules):
${tenantConfig.systemPrompt}
` : ''}

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
  customFaqs?: Array<{ question: string; answer: string }>;
  knowledgeDocs?: Array<{ filename: string; content_text: string }>;
  systemPrompt?: string;
  // Existing booking for this customer (for cancel/modify flows)
  existingBooking?: {
    reservationId: string;
    date: string;
    time: string;
    partySize: number;
    status: string;
    customerName: string;
  } | null;
  // Repeat-visitor recognition
  visitCount?: number;
  lastVisitDate?: string | null;
  // Click-to-WhatsApp campaign context — injected when lead came from a Meta ad
  ctwaContext?: string;
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
    parsed.reply = guardOutput(parsed.reply, getFallbackResponse(safeMessage, context, tenantConfig, tenantConfig.isFirstMessage ?? false).reply);

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
    return getFallbackResponse(message, context, tenantConfig, tenantConfig.isFirstMessage ?? false);
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
// IMPORTANT: No hardcoded pricing, menu items, or business-type-specific content here.
// This fallback fires for ALL tenants — restaurants, hotels, trekking companies, etc.
function getFallbackResponse(
  message: string,
  _context: ConversationContext,
  config: TenantAIConfig,
  isFirstMessage = false
): AIResponse {
  const lower = message.toLowerCase();

  // Detect angry/escalation keywords (language-agnostic approach)
  const angryWords = ['angry', 'upset', 'terrible', 'worst', 'complaint', 'manager', 'refund', 'fuck', 'shit', 'bakwaas', 'bekar'];
  const humanWords = ['human', 'real person', 'agent', 'staff', 'speak to', 'insaan', 'banda'];

  if (angryWords.some((w) => lower.includes(w)) || humanWords.some((w) => lower.includes(w))) {
    return {
      reply: config.staffName
        ? `I'm connecting you with ${config.staffName} right away 🙏 They'll be with you shortly.`
        : `I'm connecting you with our team right away 🙏 They'll be with you shortly.`,
      extractedData: {},
      intent: angryWords.some((w) => lower.includes(w)) ? 'complaint' : 'human_request',
      sentiment: 'angry',
      shouldEscalate: true,
      escalationReason: 'fallback_escalation',
      nextStep: 'escalated',
      confidence: 0.9,
    };
  }

  // Detect booking/reservation intent — generic across all business types
  const bookingWords = ['book', 'reserv', 'appoint', 'slot', 'schedule', 'availab', 'room', 'table', 'trek', 'checkin', 'check in'];
  if (bookingWords.some((w) => lower.includes(w))) {
    return {
      reply: `I'd love to help! How many people, and when are you thinking? 😊`,
      extractedData: {},
      intent: 'reserve_table',
      sentiment: 'positive',
      shouldEscalate: false,
      nextStep: 'ask_guests',
      confidence: 0.8,
    };
  }

  // Detect pricing questions — redirect to team, never invent prices
  const priceWords = ['price', 'cost', 'rate', 'charge', 'fee', 'kitna', 'how much', 'budget'];
  if (priceWords.some((w) => lower.includes(w))) {
    return {
      reply: config.business_phone
        ? `For pricing details, please contact us at ${config.phone} — we'll give you a personalised quote! 😊`
        : `Our team will be happy to share pricing details. Can I connect you with them?`,
      extractedData: {},
      intent: 'pricing',
      sentiment: 'neutral',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.8,
    };
  }

  // Detect event/group intent
  const eventWords = ['event', 'party', 'celebration', 'wedding', 'corporate', 'group', 'birthday', 'anniversary'];
  if (eventWords.some((w) => lower.includes(w))) {
    return {
      reply: `We'd love to help with that! What's the occasion, and roughly how many people? 🎉`,
      extractedData: {},
      intent: 'private_event',
      sentiment: 'positive',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.8,
    };
  }

  // Default: welcome only on first message; for ongoing conversations use a neutral holding reply
  if (isFirstMessage) {
    return {
      reply: config.welcomeMessage || `Hi! 👋 Welcome to ${config.businessName}. How can I help you today?`,
      extractedData: {},
      intent: 'greeting',
      sentiment: 'neutral',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.5,
    };
  }

  return {
    reply: `Sorry, I missed that! Could you say that again? 😊`,
    extractedData: {},
    intent: 'unknown',
    sentiment: 'neutral',
    shouldEscalate: false,
    nextStep: 'ask_intent',
    confidence: 0.3,
  };
}

// keep TS happy — config may expose phone via either field name
declare module './engine' {
  interface TenantAIConfig {
    business_phone?: string;
  }
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
