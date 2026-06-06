import { NextRequest, NextResponse, after } from 'next/server';
import { SchedulerService } from '@/lib/broadcast/services/scheduler.service';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const BATCH_SIZE = 15;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron] CRON_SECRET is not configured — endpoint disabled for security');
    return false;
  }
  const auth = req.headers.get('Authorization');
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
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const dispatchedCount = await SchedulerService.checkAndDispatchScheduled();
  const queueProcessedCount = await BroadcastEngineService.processQueue(BATCH_SIZE);

  if (queueProcessedCount >= BATCH_SIZE) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    const cronSecret = process.env.CRON_SECRET;
    if (appUrl && cronSecret) {
      after(async () => {
        try {
          await fetch(`${appUrl}/api/broadcast/process-queue`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cronSecret}` },
          });
        } catch (err) {
          console.error('[broadcasts/cron] Failed to chain next run:', err);
        }
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Cron sweep done`,
    dispatchedCampaigns: dispatchedCount,
    messagesProcessed: queueProcessedCount,
  });
}
