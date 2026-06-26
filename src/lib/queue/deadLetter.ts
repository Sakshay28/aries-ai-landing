// ═══════════════════════════════════════════════════════════
// ☠️ Dead Letter Queue (DLQ)
// ═══════════════════════════════════════════════════════════
// Failed BullMQ jobs land here after exhausting max retries.
// Supports: retry, ignore, inspect.
// Stored in DB (not Redis) for durability and auditability.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';

export type DLQJobType =
  | 'followup'
  | 'broadcast'
  | 'webhook_sync'
  | 'crm_push'
  | 'email'
  | 'ai_job'
  | 'payment';

export interface DLQEntry {
  id?: string;
  tenant_id: string;
  job_type: DLQJobType;
  flow_id?: string;
  conversation_id?: string;
  campaign_id?: string;
  payload: unknown;
  error_message: string;
  error_stack?: string;
  retry_count: number;
  failed_at: string;
  status: 'pending' | 'retried' | 'ignored';
}

// ─── Push a failed job to DLQ ─────────────────────────────────
export async function pushToDLQ(entry: Omit<DLQEntry, 'id' | 'status' | 'failed_at'>): Promise<void> {
  try {
    await supabaseAdmin.from('dead_letter_queue').insert({
      ...entry,
      payload: JSON.stringify(entry.payload),
      failed_at: new Date().toISOString(),
      status: 'pending',
    });
    console.warn(`☠️ [DLQ] Job pushed: type=${entry.job_type} tenant=${entry.tenant_id}`);
  } catch (err) {
    console.error('❌ Failed to push to DLQ:', (err as Error).message);
  }
}

// ─── Fetch DLQ entries (admin dashboard) ─────────────────────
export async function getDLQEntries(tenantId?: string, limit = 50) {
  let query = supabaseAdmin
    .from('dead_letter_queue')
    .select('*')
    .order('failed_at', { ascending: false })
    .limit(limit);

  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Mark as ignored ─────────────────────────────────────────
export async function ignoreDLQEntry(id: string): Promise<void> {
  await supabaseAdmin.from('dead_letter_queue').update({ status: 'ignored' }).eq('id', id);
}

// ─── Mark as retried ─────────────────────────────────────────
export async function markDLQRetried(id: string): Promise<void> {
  await supabaseAdmin.from('dead_letter_queue').update({ status: 'retried' }).eq('id', id);
}

// ─── DLQ SQL migration (run in Supabase) ─────────────────────
// CREATE TABLE IF NOT EXISTS dead_letter_queue (
//   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant_id       uuid NOT NULL,
//   job_type        text NOT NULL,
//   flow_id         uuid,
//   conversation_id uuid,
//   payload         text,
//   error_message   text,
//   error_stack     text,
//   retry_count     integer DEFAULT 0,
//   failed_at       timestamptz DEFAULT now(),
//   status          text DEFAULT 'pending',
//   created_at      timestamptz DEFAULT now()
// );
// CREATE INDEX ON dead_letter_queue (tenant_id, status, failed_at DESC);
