// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Queue Abstraction
//
// The scoring pipeline never depends directly on the scheduler implementation.
// Current impl: Supabase table + Vercel cron (Phase C).
// Future: swap to BullMQ / Redis / SQS / Cloud Tasks without touching business logic.
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoringJob {
  id: string;
  tenantId: string;
  leadId: string;
  conversationId: string | null;
  messageId: string | null;
  messageCount: number;        // snapshot of conv length at enqueue time
  idempotencyKey: string;      // messageId — prevents double-processing
  retryCount: number;
  createdAt: string;
}

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'dead';

export interface ScoringQueue {
  enqueue(job: Omit<ScoringJob, 'id' | 'retryCount' | 'createdAt'>): Promise<void>;
  dequeue(limit: number): Promise<ScoringJob[]>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string): Promise<void>;
  deadLetter(jobId: string, reason: string): Promise<void>;
  stats(): Promise<{ pending: number; processing: number; failed: number; dead: number }>;
}

// Trigger types for AI analysis
export type AnalysisTrigger =
  | 'message'       // inbound customer message
  | 'manual'        // salesperson triggered reanalysis
  | 'backfill'      // historical replay
  | 'cron'          // periodic re-evaluation
  | 'status_change'; // significant event triggered re-evaluation
