// ═══════════════════════════════════════════════════════════
// ⏱️  Restaurant — Seat Lock Cron Cleanup
// POST /api/restaurant/cron/cleanup
// ═══════════════════════════════════════════════════════════
// Deletes expired seat locks to release abandoned payment sessions.
// Call this every 2 minutes via Vercel Cron or external scheduler.
//
// Vercel cron config (vercel.json):
// {
//   "crons": [{
//     "path": "/api/restaurant/cron/cleanup",
//     "schedule": "*/2 * * * *"
//   }]
// }
//
// Protected by CRON_SECRET env var (set in Vercel project settings).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { count, error } = await supabaseAdmin
      .from('seat_locks')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('❌ Seat lock cleanup failed:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log(`✅ Seat lock cleanup: deleted ${count ?? 0} expired locks`);
    return NextResponse.json({ success: true, deleted: count ?? 0 });
  } catch (err) {
    console.error('❌ Seat lock cleanup exception:', err);
    return NextResponse.json({ success: false, error: 'Cleanup failed' }, { status: 500 });
  }
}

// Also support GET for Vercel Cron (which uses GET for some versions)
export async function GET(req: NextRequest) {
  return POST(req);
}
