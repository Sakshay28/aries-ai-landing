import { NextRequest, NextResponse } from 'next/server';
import { MediaAnalysisWorkerService } from '@/lib/ai/media-analysis-worker';

// Cron: re-enqueue knowledge_docs media/PDF rows stuck in pending/processing
// (serverless function died mid-flight before finishing Gemini analysis).
export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const reconciled = await MediaAnalysisWorkerService.processQueue('cron', 20);
  console.log(`✅ [media-analysis cron] re-enqueued ${reconciled} stuck job(s)`);
  return NextResponse.json({ reconciled });
}
