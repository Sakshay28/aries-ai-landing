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

  // Soft budget under the 10s maxDuration (Vercel Hobby ceiling). Each step below
  // makes real network calls (Meta, Supabase, sometimes Gemini); without a budget
  // the platform hard-kills the function mid-request, which can leave a WhatsApp
  // message delivered but its DB row still 'pending' — causing a resend next run.
  // Stopping ourselves early and returning 200 with partial counts is safer than
  // that, and gives the next run (30 min later) the rest of the queue.
  const deadline = Date.now() + 8500;
  const skipped: string[] = [];

  // 1. Timeout stale conversations (no activity for 24h)
  await processStaleConversations();

  // 2. Auto-de-escalate conversations where staff didn't respond within the tenant's timeout
  const deEscalated = await processTimedOutEscalations();

  // 3. Fire any pending follow-ups that are due
  const followUpsSent = await processPendingFollowUps(deadline);

  // 4. Fire inactivity_trigger flows for conversations with no reply
  let inactivityFired = 0;
  if (Date.now() < deadline) {
    inactivityFired = await runInactivityFlows();
  } else {
    skipped.push('inactivityFlows');
  }

  // 5. Process due automation queue items
  let automationsSent = 0;
  if (Date.now() < deadline) {
    automationsSent = await processPendingAutomations();
  } else {
    skipped.push('automations');
  }

  console.log(`[cron/timeout] followUpsSent=${followUpsSent} inactivityFired=${inactivityFired} deEscalated=${deEscalated} automationsSent=${automationsSent}${skipped.length ? ` skipped=${skipped.join(',')}` : ''}`);
  return NextResponse.json({ success: true, followUpsSent, inactivityFired, deEscalated, automationsSent, skipped });
}
