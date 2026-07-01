import { NextRequest, NextResponse } from 'next/server';
import { MicrosoftExcelWorkerService } from '@/lib/integrations/microsoft-excel-worker';

// Cron: drain the Microsoft Excel sync queue.
// Vercel Hobby = daily only; real-time draining happens via the webhook after() hook.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const processed = await MicrosoftExcelWorkerService.processQueue('cron', 200);
  console.log(`✅ [EXCEL cron] processed ${processed} jobs`);
  return NextResponse.json({ processed });
}
