#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Migration status checker — probes the LIVE Supabase DB for a marker object
// (table / column / storage bucket) created by each migration file, so you
// know exactly which migrations have been applied without guessing.
//
//   node scripts/check-migrations.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Function/index-only migrations can't be probed via PostgREST — they're
// listed as MANUAL with the object to verify in the Supabase SQL editor:
//   SELECT proname FROM pg_proc WHERE proname = '<fn>';
//   SELECT indexname FROM pg_indexes WHERE indexname = '<idx>';
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = {};
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(url, key);

// One marker per migration file in supabase/migrations/.
// type: 'table' (target = table), 'column' (target = table.column),
//       'bucket' (target = storage bucket id), 'manual' (note = what to check)
const CHECKS = [
  { file: '20260505_brand_split.sql',                      type: 'column', target: 'tenants.brand' },
  { file: '20260518_agent_configs.sql',                    type: 'table',  target: 'agent_configs' },
  { file: '20260518_automation_flows.sql',                 type: 'table',  target: 'automation_flows' },
  { file: '20260518_broadcast_replied.sql',                type: 'column', target: 'broadcast_campaigns.replied_count' },
  { file: '20260518_business_profiles.sql',                type: 'table',  target: 'business_profiles' },
  { file: '20260518_fix_rls_recursion.sql',                type: 'manual', note: 'fn get_current_tenant_id()' },
  { file: '20260518_gupshup_columns.sql',                  type: 'column', target: 'tenants.gupshup_api_key' },
  { file: '20260518_knowledge_base.sql',                   type: 'table',  target: 'knowledge_docs' },
  { file: '20260518_rag_pipeline.sql',                     type: 'manual', note: 'fn match_knowledge_docs() + embedding index' },
  { file: '20260518_smart_rules.sql',                      type: 'table',  target: 'smart_rules' },
  { file: '20260518_tenant_integrations.sql',              type: 'table',  target: 'tenant_integrations' },
  { file: '20260519_lead_assignment.sql',                  type: 'column', target: 'leads.assigned_to' },
  { file: '20260521_meta_attribution.sql',                 type: 'column', target: 'leads.fbclid' },
  { file: '20260523_add_tags_column.sql',                  type: 'column', target: 'leads.tags' },
  { file: '20260524_attachment_columns.sql',               type: 'column', target: 'messages.media_url' },
  { file: '20260529_restaurant_core.sql',                  type: 'table',  target: 'restaurant_slots' },
  { file: '20260530_add_system_prompt_to_tenants.sql',     type: 'column', target: 'tenants.system_prompt' },
  { file: '20260531_draft_templates.sql',                  type: 'table',  target: 'draft_templates' },
  { file: '20260602_broadcast_jobs_v6.sql',                type: 'column', target: 'broadcast_campaigns.launched_at' },
  { file: '20260602_broadcast_queue_v4.sql',               type: 'table',  target: 'broadcast_queue' },
  { file: '20260602_broadcast_system_v4.sql',              type: 'column', target: 'broadcast_campaigns.delivery_mode' },
  { file: '20260602_broadcast_trust_v4_1.sql',             type: 'table',  target: 'broadcast_execution_events' },
  { file: '20260602_broadcast_trust_v4_2.sql',             type: 'manual', note: 'fn increment_campaign_counter()' },
  { file: '20260602_recipient_cache_v5.sql',               type: 'table',  target: 'broadcast_campaign_recipient_cache' },
  { file: '20260603_broadcast_fix.sql',                    type: 'manual', note: 'fn sync_campaign_analytics()' },
  { file: '20260604_booking_expiry_ad_campaigns.sql',      type: 'manual', note: 'idx_lead_campaigns_ad + booking expiry cols' },
  { file: '20260604_booking_payments.sql',                 type: 'column', target: 'restaurant_bookings.payment_link_id' },
  { file: '20260604_hospitality_os_v1.sql',                type: 'column', target: 'restaurant_bookings.internal_notes' },
  { file: '20260604_hospitality_os_v2.sql',                type: 'table',  target: 'restaurant_guests' },
  { file: '20260604_lead_campaigns.sql',                   type: 'table',  target: 'lead_campaigns' },
  { file: '20260604_onboarding_approval.sql',              type: 'column', target: 'tenants.is_approved' },
  { file: '20260604_team_roles_sales.sql',                 type: 'column', target: 'users.is_sales_agent' },
  { file: '20260605_unique_lead_phone.sql',                type: 'manual', note: 'unique idx_leads_phone (tenant_id, phone)' },
  { file: '20260606_broadcast_optouts.sql',                type: 'table',  target: 'broadcast_optouts' },
  { file: '20260606_broadcast_production_hardening.sql',   type: 'manual', note: 'fn lock_broadcast_queue_batch() v1 (superseded by 20260611)' },
  { file: '20260606_ctwa_clid.sql',                        type: 'column', target: 'leads.ctwa_clid' },
  { file: '20260606_data_deletion_requests.sql',           type: 'table',  target: 'data_deletion_requests' },
  { file: '20260606_lead_search_index.sql',                type: 'manual', note: 'pg_trgm indexes on leads (name/phone/email)' },
  { file: '20260606_meta_ads_integration.sql',             type: 'table',  target: 'meta_connections' },
  { file: '20260606_revenue_features.sql',                 type: 'column', target: 'restaurant_bookings.review_rating' },
  { file: '20260607_per_tenant_whatsapp_secrets.sql',      type: 'column', target: 'tenants.wa_app_secret' },
  { file: '20260608_atomic_context_merge.sql',             type: 'manual', note: 'fn update_conversation_after_ai() — runtime-verified (used on every AI reply)' },
  { file: '20260608_security_hardening_indexes.sql',       type: 'manual', note: 'idx_messages_conv_tenant_created + idx_conv_active' },
  { file: '20260611_broadcast_production_hardening.sql',   type: 'table',  target: 'broadcast_contact_sends' },
  { file: '20260611_inbox_production_hardening.sql',       type: 'bucket', target: 'whatsapp-media' },
];

// Columns the CODE expects but that have no migration file yet — drift catchers.
const CODE_EXPECTATIONS = [
  { what: 'tenants.off_hours_enabled', usedBy: 'off-hours auto-reply switch (webhook)' },
  { what: 'broadcast_deliveries.delivered_at', usedBy: 'broadcast delivery reconciliation (status callback)' },
  { what: 'broadcast_deliveries.read_at', usedBy: 'broadcast read reconciliation (status callback)' },
  { what: 'tenants.escalation_keywords', usedBy: 'custom keyword escalation (webhook)' },
];

const isMissing = (error) =>
  !!error && /does not exist|could not find|schema cache/i.test(error.message || '');

async function probeColumn(target) {
  const [table, col] = target.split('.');
  const { error } = await sb.from(table).select(col).limit(1);
  if (!error) return 'applied';
  return isMissing(error) ? 'pending' : `error: ${error.message}`;
}

async function probeTable(target) {
  const { error } = await sb.from(target).select('*', { head: true }).limit(0);
  if (!error) return 'applied';
  return isMissing(error) ? 'pending' : `error: ${error.message}`;
}

async function probeBucket(target) {
  const { data, error } = await sb.storage.getBucket(target);
  if (data && !error) return 'applied';
  return 'pending';
}

const pad = (s, n) => String(s).padEnd(n);

console.log(`\nProbing ${url.replace(/^https?:\/\//, '').split('.')[0]} …\n`);
let applied = 0, pending = 0, manual = 0, errors = 0;
const pendingFiles = [];

for (const c of CHECKS) {
  let status;
  if (c.type === 'manual') { status = 'manual'; manual++; }
  else if (c.type === 'table') status = await probeTable(c.target);
  else if (c.type === 'column') status = await probeColumn(c.target);
  else if (c.type === 'bucket') status = await probeBucket(c.target);

  if (status === 'applied') applied++;
  else if (status === 'pending') { pending++; pendingFiles.push(c.file); }
  else if (status.startsWith('error')) errors++;

  const icon = status === 'applied' ? '✅' : status === 'pending' ? '❌' : status === 'manual' ? '⚠️ ' : '🔥';
  const detail = c.type === 'manual' ? `check: ${c.note}` : `${c.type}: ${c.target}`;
  console.log(`${icon} ${pad(c.file, 52)} ${pad(status, 8)} ${detail}`);
}

console.log('\n── Code expectations without a migration file ──');
for (const e of CODE_EXPECTATIONS) {
  const status = await probeColumn(e.what);
  const icon = status === 'applied' ? '✅' : '❌';
  console.log(`${icon} ${pad(e.what, 52)} ${pad(status, 8)} ${e.usedBy}`);
}

console.log(`\nSummary: ${applied} applied · ${pending} pending · ${manual} manual-check · ${errors} probe errors`);
if (pendingFiles.length) {
  console.log(`\nPending files to run in the Supabase SQL editor (in order):`);
  pendingFiles.forEach(f => console.log(`  supabase/migrations/${f}`));
}
console.log('');
