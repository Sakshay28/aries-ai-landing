// ═══════════════════════════════════════════════════════════
// 📋 Audit Log System
// ═══════════════════════════════════════════════════════════
// Tracks every significant state change for accountability.
// Fire-and-forget — never blocks the main operation.
//
// DB table: audit_logs
// Dashboard: /dashboard/settings/audit-log
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';

export type AuditAction =
  | 'flow_published'
  | 'flow_restored'
  | 'flow_deleted'
  | 'greeting_updated'
  | 'api_token_updated'
  | 'billing_plan_changed'
  | 'team_member_invited'
  | 'team_member_removed'
  | 'bot_paused'
  | 'bot_resumed'
  | 'broadcast_sent'
  | 'ai_model_changed'
  | 'webhook_configured'
  | 'knowledge_doc_uploaded'
  | 'knowledge_doc_deleted'
  | 'note_created'
  | 'note_deleted'
  | 'note_edited'
  | 'settings_updated'
  // Platform-admin actions — a human at Aries AI (not this tenant's own team)
  // touching this tenant's data via the internal admin tools. Surfaced in
  // the client's own Audit Log page so access is provable, not just promised.
  | 'platform_admin_viewed_credentials'
  | 'platform_admin_edited_tenant'
  | 'platform_admin_impersonated'
  | 'platform_admin_approved_signup';

export interface AuditEntry {
  tenant_id: string;
  actor_id?: string;         // user who performed the action
  actor_email?: string;
  action: AuditAction;
  entity: string;            // e.g. 'flow', 'team_member', 'settings'
  entity_id?: string;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string;
  meta?: Record<string, unknown>;
}

// ─── Log an audit event ───────────────────────────────────────
export function logAudit(entry: AuditEntry): void {
  // Fire-and-forget — never awaited, never crashes caller
  void Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      tenant_id: entry.tenant_id,
      actor_id: entry.actor_id ?? null,
      actor_email: entry.actor_email ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id ?? null,
      old_value: entry.old_value != null ? JSON.stringify(entry.old_value) : null,
      new_value: entry.new_value != null ? JSON.stringify(entry.new_value) : null,
      ip_address: entry.ip_address ?? null,
      meta: entry.meta ?? null,
      created_at: new Date().toISOString(),
    })
  ).catch(err => {
    console.warn('⚠️ logAudit failed (non-critical):', (err as Error).message);
  });
}

// ─── SQL migration ────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS audit_logs (
//   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
//   actor_id     uuid,
//   actor_email  text,
//   action       text NOT NULL,
//   entity       text NOT NULL,
//   entity_id    text,
//   old_value    text,
//   new_value    text,
//   ip_address   text,
//   meta         jsonb,
//   created_at   timestamptz DEFAULT now()
// );
// CREATE INDEX ON audit_logs (tenant_id, action, created_at DESC);
// ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "tenant audit" ON audit_logs
//   USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
