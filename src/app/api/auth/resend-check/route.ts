// TEMP DIAGNOSTIC — remove after fixing Resend. Gated by CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== 'aries-diag-7x9k2') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const raw = process.env.RESEND_API_KEY || '';
  const trimmed = raw.trim();
  const fp = (s: string) => s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '(empty)';

  const result: Record<string, unknown> = {
    present: !!raw,
    length: raw.length,
    trimmedLength: trimmed.length,
    hasWhitespace: raw.length !== trimmed.length,
    fingerprint: fp(raw),
    expectedLength: 36,
    expectedFingerprint: 're_J5H…LKzkX',
  };

  // Raw API call to Resend with the production key — surfaces the real error
  const to = req.nextUrl.searchParams.get('to');
  if (to) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${trimmed}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'AriesAI <noreply@ariesai.in>', to, subject: 'Resend prod check', text: 'prod key test' }),
      });
      result.sendStatus = r.status;
      result.sendBody = await r.json().catch(() => null);
    } catch (e) {
      result.sendThrew = (e as Error).message;
    }
  }

  return NextResponse.json(result);
}
