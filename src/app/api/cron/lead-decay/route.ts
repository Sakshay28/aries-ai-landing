// GET|POST /api/cron/lead-decay
// Daily cron: decays scores for inactive leads across all tenants.
// Authorized by CRON_SECRET bearer token.

import { NextRequest, NextResponse } from 'next/server';
import { runDecayCron } from '@/lib/scoring/lead-decay';

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest)  { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  console.log('[lead-decay cron] starting...');

  const result = await runDecayCron();

  console.log(`[lead-decay cron] done in ${Date.now() - start}ms — processed=${result.processed} decayed=${result.decayed} errors=${result.errors}`);

  return NextResponse.json({
    ok: true,
    ...result,
    durationMs: Date.now() - start,
  });
}
