import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { GoogleGenAI } from '@google/genai';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _ai;
}

export interface AISummaryBrief {
  conversationGoal: string;
  keyContext: { label: string; value: string }[];
  intents: { label: string; confidence: number }[];
  sentiment: { label: string; emoji: string; explanation: string; tone: 'positive' | 'neutral' | 'frustrated' | 'confused' };
  leadScore: number;
  leadScoreReasons: string[];
  recommendedAction: { level: 'green' | 'yellow' | 'purple'; action: string };
  snapshot: string;
}

const FALLBACK: AISummaryBrief = {
  conversationGoal: "No strong customer intent detected yet.",
  keyContext: [],
  intents: [],
  sentiment: { label: "Neutral", emoji: "⚪", explanation: "Not enough context to determine mood.", tone: "neutral" },
  leadScore: 0,
  leadScoreReasons: ["Insufficient conversation data"],
  recommendedAction: { level: "green", action: "Continue conversation to gather more context." },
  snapshot: "Conversation has just started — waiting for more customer input.",
};

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json({ success: false, error: 'Missing conversationId' }, { status: 400 });

    // Verify conversation belongs to tenant
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id, tenant_id, lead_id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!conv) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // Fetch messages
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('direction, content, ai_generated, created_at')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(60);

    if (!messages || messages.length < 2) {
      return NextResponse.json({ success: true, brief: FALLBACK });
    }

    // Build transcript
    const transcript = messages
      .map(m => `${m.direction === 'inbound' ? 'Customer' : m.ai_generated ? 'AI' : 'Agent'}: ${m.content}`)
      .join('\n');

    const prompt = `You are an AI sales intelligence assistant for an Indian business. Analyze this WhatsApp conversation and return a structured JSON brief.

CONVERSATION:
${transcript}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "conversationGoal": "One clear sentence describing what the customer is trying to accomplish",
  "keyContext": [
    { "label": "Party size", "value": "8 people" }
  ],
  "intents": [
    { "label": "Booking inquiry", "confidence": 94 },
    { "label": "Pricing inquiry", "confidence": 72 }
  ],
  "sentiment": {
    "label": "Positive",
    "emoji": "🟢",
    "explanation": "One sentence explaining the mood",
    "tone": "positive"
  },
  "leadScore": 78,
  "leadScoreReasons": ["Asked pricing questions", "Returned multiple times"],
  "recommendedAction": {
    "level": "purple",
    "action": "Assign to sales agent and send pricing brochure."
  },
  "snapshot": "One sentence TL;DR of the entire conversation."
}

Rules:
- keyContext: only include fields that are actually mentioned (party size, date, budget, event type, location, product, etc.)
- intents: max 3, confidence 0-100
- sentiment.tone must be one of: positive, neutral, frustrated, confused
- sentiment.emoji must be one of: 🟢 🟡 🔴 ⚪
- recommendedAction.level: "green" = AI can continue, "yellow" = human intervention needed, "purple" = assign to sales agent
- leadScore: 0-100 integer
- leadScoreReasons: 2-4 short bullet strings
- If conversation is too short or vague, return low scores and generic but honest values
- DO NOT mention message counts, AI reply counts, or any stats
- Output pure JSON only`;

    const ai = getAI();
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, maxOutputTokens: 800 },
    });

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const brief: AISummaryBrief = JSON.parse(cleaned);

    return NextResponse.json({ success: true, brief });
  } catch (err) {
    console.error('Summary API error:', err);
    return NextResponse.json({ success: true, brief: FALLBACK });
  }
}
