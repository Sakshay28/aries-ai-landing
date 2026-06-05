import { NextRequest, NextResponse } from 'next/server';
import { runScheduledFlows } from '@/lib/flows/engine';

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

  const flowsFired = await runScheduledFlows();

  console.log(`[cron/scheduled-flows] fired=${flowsFired}`);
  return NextResponse.json({ success: true, flowsFired });
}
