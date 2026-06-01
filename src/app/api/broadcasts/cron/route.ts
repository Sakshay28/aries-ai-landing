import { NextRequest, NextResponse } from 'next/server';
import { SchedulerService } from '@/lib/broadcast/services/scheduler.service';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date().toISOString();

    // 1. Check and dispatch scheduled campaigns
    const dispatchedCount = await SchedulerService.checkAndDispatchScheduled();

    // 2. Process enqueued messages in the throttled queue (tick dispatch loop)
    const queueProcessedCount = await BroadcastEngineService.processQueue(50);

    return NextResponse.json({
      success: true,
      message: `Successfully executed V4 cron sweep at ${now}`,
      dispatchedCampaigns: dispatchedCount,
      messagesProcessed: queueProcessedCount
    });
  } catch (error) {
    console.error('Scheduled cron sweep execution error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
