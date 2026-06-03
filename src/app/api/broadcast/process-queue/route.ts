import { NextRequest, NextResponse, after } from 'next/server';
import { SchedulerService } from '@/lib/broadcast/services/scheduler.service';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';

// Vercel Hobby: 10s max. Each message takes ~400-600ms (Meta API + 3 DB writes).
// 15 messages × 600ms = 9s — safe. If the batch is full, after() chains the next run.
export const maxDuration = 10;

const BATCH_SIZE = 15;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get('Authorization');
  const xCronSecret = req.headers.get('x-cron-secret');
  const paramSecret = new URL(req.url).searchParams.get('secret');
  return (
    authHeader === `Bearer ${cronSecret}` ||
    xCronSecret === cronSecret ||
    paramSecret === cronSecret
  );
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error('[queue] CRON_SECRET is not configured.');
    return NextResponse.json({ success: false, error: 'CRON_SECRET configuration missing' }, { status: 500 });
  }

  if (!isAuthorized(req)) {
    console.warn('[queue] Unauthorized attempt to invoke process-queue.');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[queue] Processing scheduled campaigns & sending pending queue batch...');

  // 1. Dispatch any scheduled campaigns that are now due
  const triggeredCount = await SchedulerService.checkAndDispatchScheduled();

  // 2. Process a safe-sized batch of pending messages
  const processedCount = await BroadcastEngineService.processQueue(BATCH_SIZE);

  console.log(`[queue] Tick done — triggered: ${triggeredCount}, processed: ${processedCount}`);

  // 3. If the batch was full, there may be more — chain the next run via after()
  //    so the remaining messages don't have to wait until the midnight cron.
  if (processedCount >= BATCH_SIZE) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    const cronSecret = process.env.CRON_SECRET;
    if (appUrl && cronSecret) {
      after(async () => {
        try {
          await fetch(`${appUrl}/api/broadcast/process-queue`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cronSecret}` },
          });
          console.log('[queue] Chained next process-queue run');
        } catch (err) {
          console.error('[queue] Failed to chain next run:', err);
        }
      });
    }
  }

  return NextResponse.json({
    success: true,
    triggeredCampaigns: triggeredCount,
    processedMessages: processedCount,
  });
}
