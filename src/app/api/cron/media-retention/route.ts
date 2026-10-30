// ═══════════════════════════════════════════════════════════
// 🗑️ Chat media retention — runs daily
// ═══════════════════════════════════════════════════════════
// Deletes inbound WhatsApp media older than MEDIA_RETENTION_DAYS (default 30)
// and inbox uploads older than 7 days, so Storage stays under the free plan's
// 1 GB file quota. Exceeding it got the whole project restricted on
// 2026-10-30. See
// src/lib/media/media-retention.ts for what is and isn't deleted.
//
// Manual run: GET /api/cron/media-retention?days=14 with the cron bearer
// (days is clamped to a 7-day minimum).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { purgeExpiredChatMedia, resolveRetentionDays, type StorageLike } from '@/lib/media/media-retention';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const TIME_BUDGET_MS = 50_000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const retentionDays = resolveRetentionDays(
    req.nextUrl.searchParams.get('days') ?? process.env.MEDIA_RETENTION_DAYS,
  );

  const result = await purgeExpiredChatMedia(supabaseAdmin.storage as unknown as StorageLike, {
    retentionDays,
    deadline: Date.now() + TIME_BUDGET_MS,
  });

  const freedMb = (result.freedBytes / (1024 * 1024)).toFixed(1);
  console.log(
    `🗑️ [media-retention] deleted ${result.deletedFiles}/${result.scannedFiles} files older than ${retentionDays}d ` +
    `(${freedMb} MB)${result.complete ? '' : ' — time budget hit, continues next run'}`,
  );
  if (result.errors.length) console.error('❌ [media-retention] errors:', result.errors.slice(0, 10));

  return NextResponse.json({ ok: result.errors.length === 0, retentionDays, freedMb: Number(freedMb), ...result });
}
