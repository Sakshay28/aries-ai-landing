import { NextRequest, NextResponse } from 'next/server';
import { claudeText } from '@/lib/ai/claude';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const prompt = `You are a professional WhatsApp business messaging assistant. 
Enhance the following draft message written by a customer support agent:
- Fix grammar, spelling, and punctuation
- Make it polite, clear, and professional
- Keep it concise and WhatsApp-friendly (under 300 chars if possible)
- Preserve the original meaning and intent exactly
- Do NOT add extra information the agent didn't mention
- Reply with ONLY the enhanced message text, nothing else

Draft message: "${text.trim()}"`;

    const enhanced = await claudeText(prompt, { effort: 'low', maxTokens: 2000, timeoutMs: 30000 });
    if (!enhanced) throw new Error('Empty response from AI');

    return NextResponse.json({ enhanced });
  } catch (error) {
    console.error('enhance-text error:', error);
    return NextResponse.json({ error: 'AI enhancement failed' }, { status: 500 });
  }
}
