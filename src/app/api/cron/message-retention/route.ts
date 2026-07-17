// ═══════════════════════════════════════════════════════════
// 🗓️ Message Retention Enforcement — runs daily
// ═══════════════════════════════════════════════════════════
// The privacy policy (ariesai.in/privacy, section 6) promises: "WhatsApp
// message logs are retained for up to 90 days." Until now nothing enforced
// that — messages were kept indefinitely. This purges message content older
// than the retention window, across every tenant (the cutoff is the same
// for everyone, so one query — no per-tenant loop needed).
//
// Conversations and leads are NOT touched — a business's CRM record of a
// past customer is operationally necessary to keep; it's the raw message
// text (the actual chat content) the policy is about.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 60; // clamped to 10s on Hobby — the time guard below respects that

export const RETENTION_DAYS = 90;
const BATCH_SIZE = 1000;
const TIME_BUDGET_MS = 8_000;

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

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const start = Date.now();
  let totalDeleted = 0;

  // Batched, not a single unbounded DELETE — a table with years of messages
  // shouldn't lock for an unbounded amount of time in one query.
  while (Date.now() - start < TIME_BUDGET_MS) {
    const { data: batch, error: selectError } = await supabaseAdmin
      .from('messages')
      .select('id')
      .lt('created_at', cutoff)
      .limit(BATCH_SIZE);

    if (selectError) {
      console.error('❌ [message-retention] failed to select batch:', selectError.message);
      break;
    }
    if (!batch || batch.length === 0) break;

    const ids = batch.map((m: { id: string }) => m.id);
    const { error: deleteError } = await supabaseAdmin.from('messages').delete().in('id', ids);
    if (deleteError) {
      console.error('❌ [message-retention] failed to delete batch:', deleteError.message);
      break;
    }

    totalDeleted += ids.length;
    if (batch.length < BATCH_SIZE) break; // last batch — nothing older remains
  }

  console.log(`🗓️ [message-retention] purged ${totalDeleted} messages older than ${RETENTION_DAYS} days`);
  return NextResponse.json({ ok: true, deleted: totalDeleted, cutoff });
}
