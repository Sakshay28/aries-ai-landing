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
  // Anchor the budget at the true start of request handling — everything below
  // must fit inside this, not on top of it. maxDuration=10 is the Vercel Hobby
  // ceiling (already maxed out, can't be raised), and this route chains 5 steps
  // that each make real network calls (Supabase, Meta, sometimes Gemini). Left
  // unbudgeted, the platform hard-kills the function mid-request — which can
  // leave a WhatsApp message delivered by Meta but its DB row still 'pending',
  // causing a duplicate resend next run. A 7s internal budget (3s margin for
  // cold start + response serialization, neither of which shows up in these
  // timers) means we always return 200 with partial counts instead, and the
  // next run (30 min later) picks up whatever was skipped.
  const requestStart = Date.now();
  const deadline = requestStart + 7000;
  const skipped: string[] = [];

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Timeout stale conversations (no activity for 24h)
  if (Date.now() < deadline) {
    await processStaleConversations();
  } else {
    skipped.push('staleConversations');
  }

  // 2. Auto-de-escalate conversations where staff didn't respond within the tenant's timeout
  let deEscalated = 0;
  if (Date.now() < deadline) {
    deEscalated = await processTimedOutEscalations();
  } else {
    skipped.push('escalations');
  }

  // 3. Fire any pending follow-ups that are due
  let followUpsSent = 0;
  if (Date.now() < deadline) {
    followUpsSent = await processPendingFollowUps(deadline);
  } else {
    skipped.push('followUps');
  }

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

  const elapsedMs = Date.now() - requestStart;
  console.log(`[cron/timeout] elapsedMs=${elapsedMs} followUpsSent=${followUpsSent} inactivityFired=${inactivityFired} deEscalated=${deEscalated} automationsSent=${automationsSent}${skipped.length ? ` skipped=${skipped.join(',')}` : ''}`);
  return NextResponse.json({ success: true, followUpsSent, inactivityFired, deEscalated, automationsSent, skipped, elapsedMs });
}
