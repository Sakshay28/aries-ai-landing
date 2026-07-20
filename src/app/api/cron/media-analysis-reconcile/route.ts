import { NextRequest, NextResponse, after } from 'next/server';
import { MediaAnalysisWorkerService } from '@/lib/ai/media-analysis-worker';

export const maxDuration = 60; // clamped to 10s on Hobby — large files can outlive one retry attempt, see below

// Cron: re-enqueue knowledge_docs media/PDF rows stuck in pending/processing
// (serverless function died mid-flight before finishing Gemini analysis).
export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // after() guarantees the re-enqueued analysis work keeps running past this
  // response being sent — a plain fire-and-forget call has no such guarantee
  // on Vercel, which would defeat the point of a reconciler.
  after(async () => {
    const reconciled = await MediaAnalysisWorkerService.processQueue('cron', 20);
    console.log(`✅ [media-analysis cron] re-enqueued ${reconciled} stuck job(s)`);
  });

  return NextResponse.json({ started: true });
}
