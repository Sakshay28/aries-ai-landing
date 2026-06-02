import { NextRequest, NextResponse } from 'next/server';
import { SchedulerService } from '@/lib/broadcast/services/scheduler.service';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[queue] CRON_SECRET is not configured in environment variables.');
      return NextResponse.json({ success: false, error: 'CRON_SECRET configuration missing' }, { status: 500 });
    }

    // Authorization checks
    const authHeader = req.headers.get('Authorization');
    const xCronSecret = req.headers.get('x-cron-secret');
    const { searchParams } = new URL(req.url);
    const paramSecret = searchParams.get('secret');

    const isAuthorized = 
      (authHeader === `Bearer ${cronSecret}`) ||
      (xCronSecret === cronSecret) ||
      (paramSecret === cronSecret);

    if (!isAuthorized) {
      console.warn('[queue] Unauthorized attempt to invoke process-queue.');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[queue] Processing scheduled campaigns & sending pending queue batch...');

    // 1. Dispatch any scheduled campaigns that are due
    const triggeredCount = await SchedulerService.checkAndDispatchScheduled();

    // 2. Process next batch of pending messages (batch size: 50)
    const processedCount = await BroadcastEngineService.processQueue(50);

    console.log(`[queue] Finished processing tick. Triggered campaigns: ${triggeredCount}, Processed messages: ${processedCount}`);

    return NextResponse.json({
      success: true,
      triggeredCampaigns: triggeredCount,
      processedMessages: processedCount
    });

  } catch (error: any) {
    console.error('[queue] Error processing queue tick:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
