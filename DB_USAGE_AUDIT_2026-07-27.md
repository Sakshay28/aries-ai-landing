# Supabase DB Usage Audit — 2026-07-27

Project: `qnzgvzlhirflmvtspnrh` · Access used: PostgREST + `service_role` key (read-only). No rows were modified or deleted. **Awaiting approval before any deletion.**

---

## TL;DR (read this first)

**The database is small and young. There is almost nothing to delete for space.**

- **~49,017 total rows** across all 110 tables. Largest table is `messages` at **15,168 rows**.
- **Nothing is older than 90 days.** Oldest data is ~71 days old (2026‑05‑17). The "> 90 days" retention bucket is **empty** for every table. A "delete anything older than 90 days" policy would delete **0 rows today**.
- **> 60 days:** ~200 rows total across the whole DB. **> 30 days:** ~3,900 rows, of which 2,045 are `messages` (core product data you should keep).
- Therefore **age‑based mass deletion frees essentially nothing** and only adds risk.

**What is actually likely consuming Supabase "usage":**
1. **Table bloat (dead tuples)** on high‑churn queue/job tables — `ai_jobs`, `google_sheets_sync_queue`, `flow_engine_executions`, `flow_execution_logs`, `broadcast_queue/jobs`. These insert/update/delete constantly, so their **physical size can be many times their live‑row size**. The fix is `VACUUM` (reclaim space), **not** deleting rows.
2. **Historically (per project memory, 2026‑07‑02), the overage was egress + Disk IO, not storage.** If that's still the case, deleting rows will not reduce it at all — that's a query/Realtime‑polling problem, already partially addressed.

**Recommended primary action = (a) `VACUUM (ANALYZE)` the churn tables, and (b) install forward‑looking retention automation** so logs/queues can't grow unbounded — *not* a big one‑time delete.

> ⚠️ **Physical size is not yet measured.** PostgREST (the only DB access available locally — there is no direct Postgres password/pooler URL in the env) cannot read `pg_catalog`, so I cannot get true per‑table bytes or total DB size from here. See **"How to get exact sizes"** below — it's one read‑only paste in the Supabase SQL Editor, or share the pooler connection string and I'll measure it directly.

---

## 1. Full table inventory — row counts

All 110 exposed relations. Row counts are exact (PostgREST `count=exact`).

### Tables with data (largest first)

| Table | Rows | > 30d | > 60d | > 90d | Timestamp col | Data span |
|---|--:|--:|--:|--:|---|---|
| messages | 15,168 | 2,045 | 192 | 0 | created_at | 05‑21 → 07‑27 |
| google_sheets_audit_logs | 5,178 | 0 | 0 | 0 | created_at | 07‑02 → 07‑27 |
| lead_attribution | 4,441 | 300 | 0 | 0 | created_at | 06‑26 → 07‑27 |
| lead_signal_events | 3,614 | 0 | 0 | 0 | created_at | 06‑27 → 07‑27 |
| ai_jobs | 3,446 | 0 | 0 | 0 | started_at | 07‑01 → 07‑27 |
| flow_execution_logs | 2,737 | 0 | 0 | 0 | created_at | 07‑01 → 07‑27 |
| leads | 1,883 | 114 | 1 | 0 | created_at | 05‑22 → 07‑27 |
| conversations | 1,677 | 137 | 4 | 0 | created_at | 05‑21 → 07‑27 |
| meta_ads_notifications | 1,481 | 100 | 0 | 0 | created_at | 06‑26 → 07‑27 |
| campaign_leads | 1,481 | 100 | 0 | 0 | created_at | 06‑26 → 07‑27 |
| google_sheets_sync_queue | 1,090 | 0 | 0 | 0 | created_at | 07‑01 → 07‑27 |
| flow_engine_executions | 1,089 | 0 | 0 | 0 | started_at | 07‑01 → 07‑27 |
| lead_status_history | 785 | 0 | 0 | 0 | created_at | 06‑28 → 07‑27 |
| business_notifications | 720 | 0 | 0 | 0 | created_at | 07‑01 → 07‑27 |
| broadcast_queue | 635 | 95 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| broadcast_jobs | 635 | 95 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| broadcast_recipients | 635 | 95 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| tenant_ai_costs | 492 | 0 | 0 | 0 | created_at | 07‑01 → 07‑27 |
| follow_ups | 389 | 158 | 0 | 0 | created_at | 06‑10 → 07‑26 |
| broadcast_automation_rules | 205 | 118 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| audit_logs | 184 | 11 | 3 | 0 | created_at | 05‑27 → 07‑27 |
| broadcast_execution_events | 148 | 76 | 0 | 0 | created_at | 06‑02 → 07‑26 |
| notes | 146 | 0 | 0 | 0 | created_at | 07‑01 → 07‑04 |
| broadcast_deliveries | 131 | 97 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| broadcast_campaigns | 75 | 40 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| broadcast_audiences | 66 | 38 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| broadcast_delivery_settings | 66 | 38 | 0 | 0 | created_at | 06‑02 → 07‑25 |
| analytics_events | 54 | 22 | 0 | 0 | created_at | 06‑10 → 07‑27 |
| broadcast_analytics | 51 | 23 | 0 | 0 | updated_at | 06‑02 → 07‑25 |
| broadcast_contact_sends | 37 | 12 | 0 | 0 | sent_at | 06‑12 → 07‑25 |
| restaurant_bookings | 27 | 20 | 0 | 0 | created_at | 05‑29 → 07‑25 |
| follow_up_templates | 24 | 16 | 0 | 0 | created_at | 06‑10 → 07‑17 |
| knowledge_docs | 23 | 2 | 0 | 0 | created_at | 06‑17 → 07‑20 |
| broadcast_audit_logs | 22 | 22 | 0 | 0 | created_at | 06‑02 → 06‑04 |
| broadcast_variable_mapping | 21 | 17 | 0 | 0 | created_at | 06‑02 → 07‑23 |
| broadcast_templates_cache | 19 | — | — | — | (none) | — |
| scripted_replies | 15 | 2 | 0 | 0 | created_at | 06‑21 → 07‑01 |
| users | 14 | 10 | 2 | 0 | created_at | 05‑17 → 07‑25 |
| automation_queue | 13 | 8 | 0 | 0 | created_at | 06‑21 → 07‑18 |
| system_heartbeats | 13 | — | — | — | (last_run_at) | — |
| restaurant_tables | 12 | 12 | 0 | 0 | created_at | 06‑15 |
| tenants | 10 | 6 | 1 | 0 | created_at | 05‑17 → 07‑25 |
| scoring_versions | 9 | — | — | — | (none) | — |
| webhook_events | 8 | 8 | 0 | 0 | created_at | 05‑30 |
| draft_templates | 8 | 0 | 0 | 0 | created_at | 07‑01 → 07‑03 |
| flow_versions | 7 | 6 | 0 | 0 | created_at | 05‑29 → 07‑04 |
| tenant_integrations | 3 | 1 | 0 | 0 | updated_at | 06‑04 → 07‑27 |
| sandbox_messages | 3 | 3 | 0 | 0 | created_at | 05‑30 |
| restaurant_slots | 3 | 2 | 0 | 0 | created_at | 05‑29 → 06‑30 |
| broadcast_telemetry | 3 | 0 | 0 | 0 | created_at | 07‑18 |
| automation_flows | 2 | 2 | 0 | 0 | created_at | 05‑29 → 06‑23 |
| gemini_usage_logs | 2 | 2 | 0 | 0 | created_at | 05‑30 |
| automations | 2 | 2 | 0 | 0 | created_at | 06‑21 → 06‑25 |
| broadcast_optouts | 1 | — | — | — | (opted_out_at) | — |
| data_deletion_requests | 1 | 0 | 0 | 0 | created_at | 07‑23 |
| agent_configs | 1 | 1 | 0 | 0 | created_at | 05‑30 |
| restaurant_guests | 1 | 1 | 0 | 0 | created_at | 06‑16 |
| tenant_onboarding | 1 | 1 | 0 | 0 | created_at | 05‑30 |
| restaurant_blocked_dates | 1 | 1 | 0 | 0 | created_at | 06‑12 |
| consent_records | 1 | — | — | — | (none) | — |

### Empty tables (0 rows) — nothing to clean

`microsoft_excel_sync_queue`, `microsoft_excel_audit_logs`, `shopify_events`, `tenant_signal_weights`, `ab_test_results`, `kb_query_logs`, `meta_ads`, `conversation_memory`, `proactive_outreach_log`, `schema_registry`, `lead_profiles`, `broadcast_events`, `ai_analysis_replays`, `broadcast_logs`, `broadcast_campaign_recipient_cache`, `conversation_traces`, `meta_adsets`, `wa_templates`, `bookings`, `conversation_state`, `campaign_spend_logs`, `recommendation_history`, `meta_whatsapp_numbers`, `worker_heartbeats`, `conversation_events`, `restaurant_waitlist`, `restaurant_review_requests`, `business_profiles`, `prompt_registry`, `broadcast_messages`, `kb_chunks`, `platform_stats`, `restaurant_table_activity`, `meta_pages`, `lead_ai_analysis`, `campaign_analytics`, `knowledge_media_usage`, `tenant_members`, `smart_rules`, `agent_metrics`, `meta_ad_accounts`, `seat_locks`, `low_confidence_logs`, `lead_campaigns`, `meta_connections`, `meta_campaigns`, `dead_letter_queue`, `lead_feedback`, `coexistence_history_sync`.

*(A few of the above are views: `tenants_by_brand`, `platform_stats`.)*

---

## 2. Status breakdown of churn / queue tables

| Table.column | Breakdown |
|---|---|
| ai_jobs.status | **done = 3,446** (100%) |
| google_sheets_sync_queue.status | **pending = 1,069**, failed = 9 |
| broadcast_queue.status | failed = 506, sent = 116, cancelled = 13 |
| broadcast_jobs.status | failed = 506, sent = 116, cancelled = 13 |
| automation_queue.status | sent = 12, failed = 1 |
| flow_engine_executions.status | **paused = 939** (active/waiting!), completed = 150 |
| broadcast_deliveries.status | read = 57, failed = 52, delivered = 17, sent = 5 |
| messages.direction | outbound = 8,650, inbound = 6,518 |
| messages.message_type | text = 9,521, interactive = 4,930, template = 557, document = 78, image = 49, video = 20, audio = 12, sticker = 1 |

**Two operational flags surfaced by this (not deletion targets):**
- `google_sheets_sync_queue` `pending` — **INVESTIGATED: it's live work, not junk.** The count fell from ~1,069 → 210 within ~20 minutes of observation: the queue is **actively draining and self‑cleaning** (successful syncs delete their row — `done`=0). The remaining `pending` rows are real retry work being throttled by Google Sheets' **429 read‑quota** (60 req/min/user), plus one tenant whose sync is **suspended pending re‑authentication** (that's an ops fix, not a cleanup). **Never delete pending rows.** Only the **9 `failed`** rows (max_attempts reached, inert) are safe to prune.
- `flow_engine_executions` has **939 `paused`** rows — these are *live, waiting‑to‑resume* automation runs. **Never delete paused executions.**

---

## 3. Cleanup plan (three tiers)

### Tier 1 — 100% safe to delete (transient / cache / completed jobs)
Frees little space by row count, but these are the correct bloat‑reduction targets when paired with `VACUUM`.

| Item | Rows | Notes |
|---|--:|---|
| `ai_jobs` where `status='done'` older than 7 days | ~most of 3,446 | Completed job ledger; regenerated continuously. Keep last 7d for debugging. |
| `broadcast_templates_cache` | 19 | Cache; regenerated from Meta on demand. |
| `google_sheets_sync_queue` where `status='failed'` | 9 | Dead sync attempts. Keep `pending`. |
| `automation_queue` where `status IN ('sent','failed')` | 13 | Processed queue rows. |
| `sandbox_messages` | 3 | Test/sandbox data. |
| Empty churn tables (`dead_letter_queue`, `microsoft_excel_sync_queue`, caches) | 0 | Nothing to delete; `VACUUM` only. |

### Tier 2 — Archive first, then delete (history/logs with value)
Export to CSV/JSON (or a dated backup table) before removing. All are currently young, so a **retention policy** (below) matters more than a one‑time delete.

- `google_sheets_audit_logs` (5,178), `microsoft_excel_audit_logs` (0)
- `flow_execution_logs` (2,737), `flow_engine_executions` **completed only** (150 — never the 939 paused)
- `broadcast_queue` / `broadcast_jobs` **failed + cancelled** (519 each), `broadcast_execution_events` (148), `broadcast_deliveries` (131), `broadcast_telemetry` (3)
- `meta_ads_notifications` (1,481), `analytics_events` (54), `gemini_usage_logs` (2), `webhook_events` (8)

> Broadcast tables are tied to the recent **immutable‑snapshot correctness lockdown** and to campaign analytics — archive and prune carefully, per campaign, never mid‑send.

### Tier 3 — Never delete (core / CRM / config / compliance / AI KB)
- **Identity / workspace / billing:** `users`, `tenants`, `tenant_members`, `tenant_integrations`, `tenant_onboarding`, `tenant_ai_costs`, `tenant_signal_weights`.
- **CRM:** `leads`, `lead_profiles`, `lead_campaigns`, `campaign_leads`, `lead_attribution`, `lead_status_history`, `lead_signal_events` (lead‑scoring inputs), `lead_ai_analysis`, `lead_feedback`.
- **Conversations / messages:** `conversations`, `messages`, `conversation_state`, `conversation_memory`, `conversation_events`, `notes`.
- **AI knowledge base:** `knowledge_docs`, `kb_chunks`, `knowledge_media_usage`.
- **Config / automation:** `business_profiles`, `agent_configs`, `automation_flows`, `automations`, `smart_rules`, `scripted_replies`, `follow_up_templates`, `follow_ups`, `draft_templates`, `flow_versions`, `scoring_versions`, `prompt_registry`, `schema_registry`.
- **Compliance (legal retention — must keep):** `audit_logs`, `consent_records`, `data_deletion_requests`, `broadcast_optouts`.
- **Broadcast config / immutable snapshot:** `broadcast_campaigns`, `broadcast_audiences`, `broadcast_recipients`, `broadcast_contact_sends`, `broadcast_delivery_settings`, `broadcast_analytics`, `broadcast_variable_mapping`, `broadcast_automation_rules`.
- **Meta ads integration + restaurant module + anything referenced by a foreign key.**

---

## 4. How to get exact physical sizes (one action needed)

I can't read `pg_catalog` through PostgREST. Pick one:

**Option A — paste this read‑only query in Supabase → SQL Editor and share the output** (10 seconds, zero risk):

```sql
-- Total DB size
select pg_size_pretty(pg_database_size(current_database())) as db_size;

-- Per-table total size (heap + indexes + TOAST) and dead-tuple bloat
select
  c.relname                                                as table,
  pg_size_pretty(pg_total_relation_size(c.oid))            as total_size,
  pg_size_pretty(pg_relation_size(c.oid))                  as heap_size,
  pg_size_pretty(pg_total_relation_size(c.oid)
                 - pg_relation_size(c.oid))                as index_toast_size,
  s.n_live_tup                                             as live_rows,
  s.n_dead_tup                                             as dead_rows,
  round(s.n_dead_tup*100.0/nullif(s.n_live_tup+s.n_dead_tup,0),1) as dead_pct,
  s.last_vacuum, s.last_autovacuum
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 50;
```

**Option B — share the pooler connection string** (Supabase → Settings → Database → Connection Pooling → URI, the `postgresql://postgres.[ref]:[password]@...pooler.supabase.com:6543/postgres` one). I'll then measure sizes, run the batched cleanup, and `VACUUM (ANALYZE)` directly and safely.

Once I have real sizes I'll pinpoint the actual bloat and report **before → after**.

---

## 5. Prevention — forward retention automation (the real deliverable)

Because the tables are small *today* but the churn tables will grow, the durable fix is an automatic retention job (Supabase `pg_cron`, or a Vercel cron route guarded by `CRON_SECRET`). Proposed defaults (all tunable, none touch Tier 3):

| Table | Retention | Rule |
|---|---|---|
| `ai_jobs` | 7 days | delete where `status='done'` |
| `google_sheets_audit_logs`, `microsoft_excel_audit_logs` | 30 days | delete by `created_at` |
| `flow_execution_logs` | 30 days | delete by `created_at` |
| `flow_engine_executions` | 30 days | delete where `status='completed'` (keep `paused`) |
| `webhook_events`, `gemini_usage_logs`, `analytics_events` | 30–60 days | delete by `created_at` |
| `broadcast_queue`/`broadcast_jobs` | 90 days | delete where `status IN ('sent','failed','cancelled')` |
| `messages` | **keep (no auto-delete)** | product data; only prune on explicit, per‑tenant policy |
| audit/consent/opt‑out/CRM/KB/config | **keep forever** | compliance + core |

Plus: enable `autovacuum` tuning (lower `autovacuum_vacuum_scale_factor`) on the churn tables so bloat is reclaimed continuously.

---

## 6. Status

- [x] Audit complete (row counts, age 30/60/90, status breakdowns, tiering).
- [x] **Tier‑1 cleanup executed** by owner in Supabase SQL Editor (see Section 7).
- [x] `VACUUM (ANALYZE)` run on churn tables — success.
- [ ] Physical sizes — needs Option A or B above (run the Section 4 query to get before→after MB).
- [ ] `VACUUM FULL` on `ai_jobs` — needed to actually *shrink on‑disk size* after the 2,744‑row delete (plain VACUUM only frees space for reuse).
- [ ] Retention automation — implement after decision.

## 7. Cleanup executed — 2026‑07‑27

Owner ran the Tier‑1 transaction + `VACUUM (ANALYZE)` in the SQL Editor. Verified after‑state via PostgREST:

| Table | Before | After | Removed |
|---|--:|--:|--:|
| `ai_jobs` (status=done > 7d) | 3,446 | 702 | 2,744 |
| `automation_queue` (sent/failed) | 13 | 0 | 13 |
| `google_sheets_sync_queue` (failed) | 9 | 0 | 9 |
| `sandbox_messages` | 3 | 0 | 3 |
| **Total** | | | **2,769** |

Guardrail re‑check (all protected tables intact, growing with live traffic): `messages` 16,447, `leads` 2,027, `conversations` 1,822, `audit_logs` 200, `users` 15, `tenants` 11, `knowledge_docs` 23, `broadcast_campaigns` 82. No core data deleted.

> **Note on disk reclaim:** plain `VACUUM` marks the 2,744 deleted `ai_jobs` rows' space reusable but does **not** return it to the OS or lower Supabase's reported DB size. `VACUUM FULL` (below) actually shrinks it.

`VACUUM FULL` run by owner on `ai_jobs`, `google_sheets_sync_queue`, `flow_engine_executions`, `broadcast_queue`, `broadcast_jobs` — all success. `ai_jobs` dropped out of the top‑15 tables afterward.

## 8. Physical sizes — measured 2026‑07‑27 (the decisive finding)

Top 15 tables by total size (after cleanup + VACUUM FULL):

| Table | Total size | Live rows | Dead rows |
|---|--:|--:|--:|
| messages | 22 MB | 16,451 | 4 |
| conversations | 6.0 MB | 1,822 | 197 |
| leads | 4.1 MB | 2,027 | 53 |
| campaign_leads | 2.8 MB | 1,591 | 0 |
| google_sheets_audit_logs | 2.6 MB | 6,998 | 0 |
| flow_engine_executions | 2.5 MB | 1,197 | 1 |
| lead_signal_events | 1.7 MB | 4,039 | 0 |
| lead_attribution | 1.7 MB | 4,771 | 0 |
| flow_execution_logs | 1.6 MB | 3,034 | 0 |
| business_notifications | 0.85 MB | 756 | 183 |
| knowledge_docs | 0.83 MB | 23 | 22 |
| meta_ads_notifications | 0.57 MB | 1,591 | 0 |
| lead_status_history | 0.54 MB | 1,062 | 0 |
| tenants | 0.48 MB | 11 | 18 |
| broadcast_queue | 0.42 MB | 941 | 0 |

**Total DB = 301 MB** (`pg_database_size`); dashboard reports **0.334 GB / 0.5 GB = 67%** of the Free‑plan storage cap. The `public` top‑15 sum is only ~49 MB, so **~250 MB lives in other schemas / bloat** my `public`‑only query didn't measure (`auth`, `storage`, `realtime`, `cron.job_run_details`, `net._http_response`, `pg_stat_statements`, catalog bloat). That needs an all‑schema size query (Section 9) to locate.

### ⛔ CONFIRMED: the quota cause is EGRESS, not storage

Supabase's own grace‑period banner states it verbatim: **"Your organization went over its quota in the previous billing cycle (Egress Exceeded). … grace period ends on 04 Aug 2026. After that … requests to your projects will return a 402 status code."**

Usage Summary (Free plan, cycle 06 Jul–06 Aug 2026):

| Metric | Usage | Status |
|---|---|---|
| **Egress** | 1.449 / 5 GB (29% this cycle; **exceeded last cycle**) | 🔴 the overage |
| Database Size | 0.334 / 0.5 GB (67%) | 🟡 climbing, not over |
| Storage Size | 0.243 / 1 GB (24%) | 🟢 |
| Realtime peak connections | 3 / 200 (2%) | 🟢 |
| Monthly Active Users | 16 / 50,000 | 🟢 |
| Realtime messages | 0 / 2,000,000 | 🟢 |
| Edge fn invocations | 0 / 500,000 | 🟢 |

**Therefore deleting DB rows cannot prevent the 04 Aug restriction.** The Tier‑1 cleanup + VACUUM was correct hygiene (and keeps storage off the 500 MB ceiling), but the **04 Aug fix is entirely on the egress side**:

1. **Cut read egress at the source** — chat/inbox polling pulling message history every few seconds is the classic driver (2026‑07‑02: egress 123%, redundant chat polls duplicating Realtime; that slowdown 3s/2s/5s → 10s/6s/20s was **never committed/deployed** per project memory). Re‑verify in code and ship.
2. **Reduce over‑fetching** — `select('*')` on `messages`/`leads` in hot paths, unbounded history pulls, media re‑downloads (22 MB `messages` is the biggest egress surface).
3. **Prefer Realtime over polling** where both run (double‑fetch), and paginate history.
4. **Locate the hidden ~250 MB DB size** (Section 9) — likely `cron`/`net`/`realtime`/`auth` history with its own retention; keeps storage from becoming a *second* quota in a later cycle.
5. **Retention automation** (Section 5) — prevention for growth, not the current egress fire.

## 10. Egress fix #1 — chat sidebar digest‑gated poll (2026‑08‑01)

**Root cause of the egress overage:** `ChatSidebar.load()` refetched the *entire* conversation list (up to ~2000 rows + all leads ≈ **~350 KB**) on **every 20s fallback poll AND every Realtime event**, per open agent tab — no change detection. One agent with the inbox open ≈ 350 KB × 4,320 polls/day ≈ **~1.5 GB/day**; a few agents blow past the 5 GB/month Free cap easily. The code comments already named this line "the single biggest lever on Supabase egress."

**Change (no DB migration, full‑fetch correctness path untouched):**
- New `GET /api/dashboard/chat/conversations/digest` → returns only `{ count, maxTs }` computed in Postgres (~200 bytes).
- `GET /api/dashboard/chat/conversations` now also returns that `digest`, so a full load refreshes the client baseline.
- `ChatSidebar`: the 20s poll now fetches the **digest** and only runs the heavy `load()` when `(count, maxTs)` changed. Any digest error/network hiccup falls back to a full load (previous behaviour) — the inbox can never get stuck stale.
- Realtime‑triggered reloads are **debounced (800 ms)** so a burst of messages collapses into one refetch instead of one per event.

**Expected impact:** idle 20s poll **~350 KB → ~200 bytes (~99.9%)**; full fetches now happen only on a genuine new/changed message (bounded by real activity, not a fixed cadence). This targets the dominant egress driver directly.

**Verified:** `tsc --noEmit` clean; dev server (port 3021) compiles the chat routes; `/conversations/digest` returns a correct `401` unauthenticated (wired, no crash); `/dashboard/chat` returns `307` to login (no 500). Logged‑in UI behaviour (digest polling in the network tab) needs a real session — pending owner test on `localhost:3000` or post‑deploy check in the Supabase egress graph.

**Status: DEPLOYED to production 2026‑08‑01.** Isolated onto a clean branch (`fix/chat-sidebar-egress-reduction`) off `origin/main` — kept separate from the unrelated in‑progress work sitting in the working tree — verified there (tsc clean, ESLint clean, production `next build` exit 0, digest route present in the route manifest), then fast‑forward‑pushed straight to `main` (`5fb9273..08b517d`) per the project's normal single‑branch deploy workflow, triggering the Vercel auto‑deploy. Pre‑deploy full test suite: 936/939 passing (3 pre‑existing failures unrelated to this change — Google Sheets casing assertion + a missing test‑env var on an unrelated flow‑override test).

## 9. All‑schema size query (to find the hidden ~250 MB)

```sql
-- Biggest relations across ALL schemas (not just public)
select n.nspname as schema, c.relname as name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','t','m') and n.nspname not in ('pg_catalog','information_schema')
order by pg_total_relation_size(c.oid) desc
limit 25;

-- Size by schema
select n.nspname as schema,
       pg_size_pretty(sum(pg_total_relation_size(c.oid))) as total
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','t','m')
group by 1 order by sum(pg_total_relation_size(c.oid)) desc;
```
