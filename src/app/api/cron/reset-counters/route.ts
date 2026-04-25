// ═══════════════════════════════════════════════════════════
// 🔄 Monthly Counter Reset Cron
// ═══════════════════════════════════════════════════════════
// Resets messages_used_this_month and ai_conversations_this_month
// for all active tenants on the 1st of each month.
//
// Called by Vercel Cron: "0 0 1 * *" (midnight UTC, 1st of month)
// Protected by CRON_SECRET to prevent unauthorized resets.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth: validate CRON_SECRET
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRITICAL: CRON_SECRET not set — cron endpoint is unprotected');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('❌ Cron: Unauthorized reset-counters attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error } = await supabaseAdmin.rpc('reset_monthly_counters');

    if (error) {
      console.error('❌ Monthly counter reset failed:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Also flush Redis usage keys so in-memory counts match DB
    const { getRedisClient } = await import('@/lib/redis/client');
    const redis = getRedisClient();
    if (redis) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      // Find and delete all usage keys for the just-reset month
      const keys = await redis.keys(`usage:msg:*:${currentMonth}`);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`🔄 Flushed ${keys.length} Redis usage keys for ${currentMonth}`);
      }
    }

    const timestamp = new Date().toISOString();
    console.log(`✅ Monthly counters reset at ${timestamp}`);

    return NextResponse.json({
      success: true,
      message: 'Monthly counters reset successfully',
      timestamp,
    });
  } catch (err) {
    console.error('❌ reset-counters cron error:', err);
    return NextResponse.json({ success: false, error: 'Counter reset failed' }, { status: 500 });
  }
}
