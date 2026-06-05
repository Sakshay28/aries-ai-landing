import { NextRequest, NextResponse } from 'next/server';
import { processPendingFollowUps, processStaleConversations } from '@/lib/followup/engine';
import { runInactivityFlows } from '@/lib/flows/engine';

export const maxDuration = 10;

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

  // 1. Timeout stale conversations (no activity for 24h)
  await processStaleConversations();

  // 2. Fire any pending follow-ups that are due
  const followUpsSent = await processPendingFollowUps();

  // 3. Fire inactivity_trigger flows for conversations with no reply
  const inactivityFired = await runInactivityFlows();

  console.log(`[cron/timeout] followUpsSent=${followUpsSent} inactivityFired=${inactivityFired}`);
  return NextResponse.json({ success: true, followUpsSent, inactivityFired });
}
