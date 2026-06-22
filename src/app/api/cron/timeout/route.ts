import { NextRequest, NextResponse } from 'next/server';
import { processPendingFollowUps, processStaleConversations, processTimedOutEscalations } from '@/lib/followup/engine';
import { runInactivityFlows } from '@/lib/flows/engine';
import { processPendingAutomations } from '@/lib/automations/engine';

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

  // 2. Auto-de-escalate conversations where staff didn't respond within the tenant's timeout
  const deEscalated = await processTimedOutEscalations();

  // 3. Fire any pending follow-ups that are due
  const followUpsSent = await processPendingFollowUps();

  // 4. Fire inactivity_trigger flows for conversations with no reply
  const inactivityFired = await runInactivityFlows();

  // 5. Process due automation queue items
  const automationsSent = await processPendingAutomations();

  console.log(`[cron/timeout] followUpsSent=${followUpsSent} inactivityFired=${inactivityFired} deEscalated=${deEscalated} automationsSent=${automationsSent}`);
  return NextResponse.json({ success: true, followUpsSent, inactivityFired, deEscalated, automationsSent });
}
