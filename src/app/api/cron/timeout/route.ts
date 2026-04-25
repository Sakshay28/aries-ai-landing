// ═══════════════════════════════════════════════════════════
// ⏰ Cron: Conversation Timeout + Follow-Up Processing
// ═══════════════════════════════════════════════════════════
// Called by Vercel Cron or external cron service every minute.
// 1. Times out stale conversations (24h+ inactive)
// 2. Processes pending follow-ups (fallback when BullMQ unavailable)
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { processPendingFollowUps } from '@/lib/followup/engine';

// Verify cron secret to prevent unauthorized calls
function verifyCronSecret(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error('CRON_SECRET is not set — rejecting request');
    return false;
  }
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  return secret === expectedSecret;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    timedOutConversations: 0,
    followUpsSent: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Timeout stale conversations ──
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: staleConvs, error: staleErr } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('is_active', true)
      .lt('last_message_at', twentyFourHoursAgo)
      .limit(100);

    if (staleErr) {
      results.errors.push(`Stale query error: ${staleErr.message}`);
    } else if (staleConvs && staleConvs.length > 0) {
      const ids = staleConvs.map((c) => c.id);

      const { error: updateErr } = await supabaseAdmin
        .from('conversations')
        .update({ is_active: false, current_step: 'timed_out' })
        .in('id', ids);

      if (updateErr) {
        results.errors.push(`Timeout update error: ${updateErr.message}`);
      } else {
        results.timedOutConversations = ids.length;
      }
    }

    // ── 2. Process pending follow-ups ──
    try {
      results.followUpsSent = await processPendingFollowUps();
    } catch (err) {
      results.errors.push(`Follow-ups error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    console.log(`⏰ Cron: ${results.timedOutConversations} timed out, ${results.followUpsSent} follow-ups sent`);

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Cron job failed' },
      { status: 500 }
    );
  }
}
