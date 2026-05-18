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

PERSONALITY: ${tenantConfig.botPersonality}. You speak naturally, use emojis sparingly, and keep responses SHORT (2-4 sentences max). You understand Hindi, Hinglish, and English.

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
3. Collect required info naturally through conversation (guests, date, name, phone)
4. Confirm the booking and alert staff
5. Answer general questions about the business

${tenantConfig.smartRules && tenantConfig.smartRules.length > 0 ? `SMART RULES (always follow these alongside your core job):
${tenantConfig.smartRules.map((r, i) => `${i + 1}. [${r.name}] When: ${r.trigger_source} → ${r.ai_summary}`).join('\n')}` : ''}

RULES:
- NEVER make up information you don't have
- NEVER start with a greeting if this is not the first message in the conversation
- If someone is angry or asks for a human, say you're connecting them to the team
- Keep responses under 300 characters for WhatsApp readability
- Be helpful but don't be pushy
- If you can't understand something, ask for clarification politely
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
    "specialRequests": null
  },
  "nextStep": "what info to collect next: greeting, ask_intent, ask_guests, ask_date, ask_occasion, ask_name, ask_phone, ask_email, confirmation, completed, escalated",
  "confidence": 0.95
}`;
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
        parts: [{ text: message }],
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
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    return {
      reply: parsed.reply || "I'd love to help! Could you tell me more?",
      extractedData: parsed.extractedData || {},
      intent: parsed.intent || 'unknown',
      sentiment: parsed.sentiment || 'neutral',
      shouldEscalate: parsed.shouldEscalate || false,
      escalationReason: parsed.escalationReason,
      nextStep: parsed.nextStep || 'ask_intent',
      confidence: parsed.confidence || 0.5,
    };
  } catch {
    // If JSON parsing fails, use the raw text as the reply
    return {
      reply: text || "I'd love to help! Could you tell me what you're looking for?",
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
