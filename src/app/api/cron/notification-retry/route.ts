import { NextRequest, NextResponse } from 'next/server';
import { processNotificationRetries } from '@/lib/whatsapp/businessNotify';

export const maxDuration = 30;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const { claimed, retried } = await processNotificationRetries();
  const ms = Date.now() - startedAt;
  console.log(`[cron/notification-retry] claimed=${claimed} retried=${retried} durationMs=${ms}`);
  return NextResponse.json({ success: true, claimed, retried, durationMs: ms });
}
