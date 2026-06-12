# Migrations — Single Source of Truth

All SQL migrations live in **this folder**, named `YYYYMMDD_description.sql`, applied
**manually** in the Supabase SQL editor (project `qnzgvzlhirflmvtspnrh`).

> Consolidated 2026-06-12 from three folders (`migrations/`, `supabase/migrations/`,
> `src/lib/database/migrations/`). Do not create migration files anywhere else.

## Workflow

1. Add a new file here: `YYYYMMDD_short_description.sql` (idempotent — use
   `IF NOT EXISTS` / `CREATE OR REPLACE` so re-runs are safe).
2. Paste it into the Supabase SQL editor and run it **before** deploying code
   that depends on it.
3. Verify with the checker, which probes the live DB for each migration's
   marker object:

   ```bash
   node scripts/check-migrations.mjs
   ```

Schema drift is not theoretical here: an unapplied-column mismatch
(`messages.failure_reason`) silently dropped every AI reply for 3 days in
June 2026. The checker exists so that never happens again.

## Status (live-DB probe, 2026-06-12)

**33 applied · 2 pending · 10 manual-check**

### ❌ Pending — run these in the SQL editor

| File | Adds | Impact while missing |
|---|---|---|
| `20260521_meta_attribution.sql` | `leads.meta_campaign_id/meta_ad_id/meta_adset_id/fbclid` + indexes | Meta CTWA ad attribution writes to leads fail silently |
| `20260602_broadcast_jobs_v6.sql` | `broadcast_campaigns.launched_at/total_recipients` etc. | Campaign launch metadata not recorded |

### ⚠️ Manual check — functions/indexes PostgREST can't probe

Verify in SQL editor with
`SELECT proname FROM pg_proc WHERE proname = '<fn>'` /
`SELECT indexname FROM pg_indexes WHERE indexname = '<idx>'`:

| File | Object |
|---|---|
| `20260518_fix_rls_recursion.sql` | fn `get_current_tenant_id()` (RLS works → almost certainly applied) |
| `20260518_rag_pipeline.sql` | fn `match_knowledge_docs()` + embedding index |
| `20260602_broadcast_trust_v4_2.sql` | fn `increment_campaign_counter()` |
| `20260603_broadcast_fix.sql` | fn `sync_campaign_analytics()` |
| `20260604_booking_expiry_ad_campaigns.sql` | `idx_lead_campaigns_ad` + booking expiry columns |
| `20260605_unique_lead_phone.sql` | unique `idx_leads_phone (tenant_id, phone)` |
| `20260606_broadcast_production_hardening.sql` | fn `lock_broadcast_queue_batch()` v1 — **superseded by 20260611 version** |
| `20260606_lead_search_index.sql` | pg_trgm indexes on leads |
| `20260608_atomic_context_merge.sql` | fn `update_conversation_after_ai()` — runtime-verified applied (used on every AI reply) |
| `20260608_security_hardening_indexes.sql` | `idx_messages_conv_tenant_created`, `idx_conv_active` |

### ✅ Applied (33)

Everything else — verified by live marker probe. Re-run the checker any time
for a current report.
