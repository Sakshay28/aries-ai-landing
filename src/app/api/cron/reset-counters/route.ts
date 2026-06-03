import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 10;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Reset monthly usage counters for all active tenants whose billing period starts today
  // Vercel cron fires on the 1st of each month (schedule: "0 0 1 * *")
  const { error, count } = await supabaseAdmin
    .from('tenants')
    .update({
      messages_used_this_month: 0,
      ai_conversations_this_month: 0,
      current_billing_period_start: now,
      updated_at: now,
    }, { count: 'exact' })
    .eq('is_active', true);

  if (error) {
    console.error('[cron/reset-counters] Failed to reset counters:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  console.log(`[cron/reset-counters] Reset monthly counters for ${count ?? 0} tenants`);
  return NextResponse.json({ success: true, tenantsReset: count ?? 0 });
}
