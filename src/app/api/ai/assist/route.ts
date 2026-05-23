import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

let _ai: GoogleGenAI | null = null;
function getAI() {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _ai;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type AssistMode =
  // Text modes (when input has text)
  | 'correct'
  | 'professional'
  | 'friendly'
  | 'sales'
  | 'shorter'
  | 'persuasive'
  | 'translate_en'
  | 'hinglish_to_en'
  | 'en_to_hinglish'
  | 'better_reply'
  // No-text modes
  | 'smart_reply'
  | 'summarize'
  | 'followup'
  | 'suggest'
  | 'lead_intent';

interface RecentMessage {
  direction: 'inbound' | 'outbound';
  content: string;
  created_at: string;
}

interface AssistRequest {
  mode: AssistMode;
  currentText?: string;
  recentMessages?: RecentMessage[];
  languagePreference?: 'auto' | 'en' | 'hinglish';
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildContextString(messages: RecentMessage[]): string {
  if (!messages?.length) return 'No recent messages.';
  return messages
    .slice(-15)
    .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content}`)
    .join('\n');
}

function buildSystemPrompt(): string {
  return `You are an expert WhatsApp CRM messaging assistant for Indian businesses.
You understand English, Hinglish (Hindi written in English letters), mixed Hindi-English, informal slang, and broken grammar.
You know the context of sales conversations, customer support, payment reminders, and follow-ups.

CRITICAL RULES:
- Output ONLY the improved message text. No explanations, no labels, no quotes.
- Never add information that wasn't in the original message.
- Preserve the original intent and key facts.
- Keep it WhatsApp-friendly: concise, warm, clear.
- For Hinglish input, understand the meaning correctly before rewriting.
- When preserving Hinglish style, use natural romanized Hindi.`;
}

function buildPrompt(req: AssistRequest): string {
  const ctx = buildContextString(req.recentMessages || []);
  const input = req.currentText?.trim() || '';

  const prompts: Record<AssistMode, string> = {
    correct: `Fix grammar, spelling, and sentence structure of the message below.
- Keep the same language and tone (if Hinglish stays Hinglish, if English stays English).
- Only fix what is broken. Do not over-formalize.
- Output only the corrected message.

Recent chat context:
${ctx}

Message to correct: "${input}"`,

    professional: `Rewrite this WhatsApp message in a professional business tone.
- Fix grammar and structure.
- Polite, clear, business-appropriate.
- WhatsApp-friendly length (under 250 chars ideally).
- Do NOT add emoji unless original had them.

Recent chat context:
${ctx}

Original message: "${input}"`,

    friendly: `Rewrite this message in a warm, friendly, approachable tone.
- Add a friendly emoji or two if appropriate.
- Keep it human and natural, not robotic.
- Preserve the original intent.

Recent chat context:
${ctx}

Original message: "${input}"`,

    sales: `Rewrite this as a persuasive sales message.
- Friendly but business-focused.
- Create mild urgency or curiosity where appropriate.
- Add a soft call-to-action.
- Keep it WhatsApp-friendly (concise, warm).

Recent chat context:
${ctx}

Original message: "${input}"`,

    shorter: `Make this message shorter and more to the point.
- Keep all key information.
- Remove filler words.
- Output only the shorter version.

Original message: "${input}"`,

    persuasive: `Rewrite this to be more persuasive and compelling.
- Focus on value/benefit to the customer.
- Confident but not pushy.
- Add social proof or urgency if it fits naturally.

Recent chat context:
${ctx}

Original message: "${input}"`,

    translate_en: `Translate this message to clear, natural English.
- If already English, clean it up.
- Business-appropriate.
- Output only the translation.

Message: "${input}"`,

    hinglish_to_en: `This message is written in Hinglish (Hindi in English letters) or mixed Hindi-English.
Translate it to natural, professional English.
Output only the English translation.

Message: "${input}"`,

    en_to_hinglish: `Rewrite this English message in natural Hinglish (Hindi written in English letters, the way Indians chat on WhatsApp).
- Sound casual and natural.
- Mix Hindi and English naturally.
- Do not use Devanagari script.

Message: "${input}"`,

    better_reply: `Based on the conversation context, write a better reply to what the customer said.
- Understand the customer's last message.
- Reply helpfully, professionally, with warmth.
- Keep it concise and WhatsApp-friendly.
- If the agent has a draft, improve it. If not, craft a fresh reply.

Recent conversation:
${ctx}

Agent's draft (may be empty): "${input}"`,

    smart_reply: `Based on this WhatsApp conversation, suggest 3 smart reply options the agent can send.
- Each reply should be short (under 100 chars).
- Cover different tones: professional, friendly, informative.
- Format as 3 lines, one reply per line. No numbers, no labels, no quotes.

Recent conversation:
${ctx}`,

    summarize: `Summarize this WhatsApp conversation in 2-3 sentences.
- What has been discussed?
- What is the customer's need or concern?
- What is the current status?
- Output only the summary.

Conversation:
${ctx}`,

    followup: `Write a WhatsApp follow-up message based on this conversation.
- Friendly reminder tone.
- Reference what was discussed.
- Include a gentle call-to-action.
- WhatsApp-appropriate (concise, warm).

Previous conversation:
${ctx}`,

    suggest: `Based on this conversation, what should the agent say next?
Write ONE ideal response from the agent.
- Helpful, professional, warm.
- Address the customer's latest message or need.
- WhatsApp-friendly.

Recent conversation:
${ctx}`,

    lead_intent: `Analyze this WhatsApp conversation and provide a brief lead intent summary.
Format:
Interest Level: [Hot/Warm/Cold]
Main Interest: [what they want]
Key Concern: [their main objection/concern]
Recommended Action: [what agent should do next]

Keep each line to 1 sentence max. Output only these 4 lines.

Conversation:
${ctx}`,
  };

  return prompts[req.mode] || prompts.correct;
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: AssistRequest = await req.json();
    const { mode, currentText, recentMessages } = body;

    // Validate: text modes need input text
    const textModes: AssistMode[] = [
      'correct', 'professional', 'friendly', 'sales', 'shorter',
      'persuasive', 'translate_en', 'hinglish_to_en', 'en_to_hinglish', 'better_reply',
    ];
    if (textModes.includes(mode) && !currentText?.trim()) {
      return NextResponse.json({ error: 'No text provided for this mode' }, { status: 400 });
    }

    const prompt = buildPrompt(body);
    const systemPrompt = buildSystemPrompt();

    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
        maxOutputTokens: 512,
      },
    });

    const result = response.text?.trim();
    if (!result) throw new Error('Empty AI response');

    // For smart_reply mode, split into multiple suggestions
    if (mode === 'smart_reply') {
      const suggestions = result.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
      return NextResponse.json({ suggestions, mode });
    }

    // For lead_intent mode, return as-is
    if (mode === 'lead_intent') {
      return NextResponse.json({ result, mode });
    }

    return NextResponse.json({ result, mode });
  } catch (error) {
    console.error('[AI Assist] error:', error);
    return NextResponse.json({ error: 'AI assist failed' }, { status: 500 });
  }
}
