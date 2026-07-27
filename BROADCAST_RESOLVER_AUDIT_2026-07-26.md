# Broadcast Resolver Audit + Correctness Lockdown Plan (2026-07-26)

Exhaustive map of **every code path that converts an audience into recipient IDs**, verified by grep across the whole repo, followed by the Correctness Lockdown pre-stage report. Every claim is file:line cited.

---

## Part A — The resolver graph (every audience → recipient-ID path)

### A.1 The primitives (leads → rows)
`src/lib/broadcast/fetch-leads.ts` — `fetchLeadsByFilter` / `fetchLeadsByIds` / `fetchRecentLeads`. Pagination-safe (page past the 1000-row PostgREST cap). Every resolver below funnels through these.

### A.2 The TWO resolvers (the divergence hazard)

```
                AUDIENCE DEFINITION
   broadcast_audiences: audience_type, tag_ids,
   filters{ manualContactIds, excludedContactIds, csvFile, recentCount, retarget* }
                          │
        ┌─────────────────┴──────────────────────────┐
        ▼                                             ▼
  RESOLVER A                                     RESOLVER B
  AudienceEngineService.resolveAudience          BroadcastRecipientService.resolveBroadcastAudience
  returns { total, contacts[] }                  returns RecipientRecord[]  ── WRITES ──▶ broadcast_campaign_recipient_cache
  audience-engine.service.ts:22                  broadcast-recipient.service.ts:36        (delete+rewrite on EVERY call)
        │                                             │
   consumers of A:                              consumers of B:
    • broadcast-engine.service.ts:151            • /api/broadcast/recipients  POST   → estimate/preview  (recipients/route.ts:17)
        launchCampaign → INSERT broadcast_queue  • BroadcastRecipientService.getCampaignRecipients
        ***THE ACTUAL SEND***                        → cache read, dynamic fallback re-calls B  (broadcast-recipient.service.ts:424)
    • audience-estimator.service.ts:19               consumed by /api/broadcast/recipients GET (recipients/route.ts:43)
        (a SECOND estimate path)
    • broadcast-readiness.service.ts:129
        (readiness score)
```

**Hidden resolvers found that I had NOT previously reported:**
- `audience-estimator.service.ts:19` — a *second* estimate path on Resolver A.
- `broadcast-readiness.service.ts:129` — readiness score resolves the audience independently.

So **Resolver A has 3 consumers** (send, estimator, readiness) and **Resolver B has 2** (preview POST, cache GET). A and B are hand-duplicated copies → the count the user approves (B) and the set that sends (A) can silently diverge. This is the core hazard.

### A.3 The TWO launch entrypoints (both re-resolve)
- `/api/broadcast/launch` → `launchCampaign` → Resolver A (launch/route.ts:138)
- `/api/broadcasts/send` → `launchCampaign` → Resolver A (broadcasts/send/route.ts, **live** — called by `BroadcastClient.tsx:461`)

### A.4 The scheduler RE-RESOLVES at dispatch (snapshot violation)
`SchedulerService.checkAndDispatchScheduled` (scheduler.service.ts) CAS-claims a `scheduled` campaign and calls `launchCampaign` **when the cron fires** — so a scheduled campaign's recipients are computed at *dispatch* time, not at *schedule* time. Any change to contacts/audience between scheduling and firing changes who gets the message.

### A.5 Post-launch paths — read persisted rows, do NOT re-resolve (snapshot-respecting ✅)
Verified these never re-run a resolver; they operate on `broadcast_queue` / `broadcast_deliveries`:
| Category | Path | Behavior |
|---|---|---|
| **Retry / resend** | `campaign/[id]/retry-now/route.ts` | resets `next_attempt_at` on existing queue rows ✅ |
| **Retry (in-loop)** | `broadcast-engine.service.ts:850-924` | re-sends existing queue rows ✅ |
| **Cancel** | `campaign/[id]/cancel/route.ts` | flips queue rows → `cancelled` ✅ |
| **Progress / stats** | `campaign/[id]/stats/route.ts`, `campaign/[id]/recipients/route.ts` | reads queue+deliveries ✅ |
| **Analytics / insights** | `campaign/[id]/insights/route.ts`, `broadcast_analytics` | reads queue+deliveries ✅ |
| **Webhook reconciliation** | `api/broadcast/webhook/route.ts`, `api/webhooks/whatsapp/route.ts` | updates `broadcast_deliveries` by `message_id` ✅ |
| **Duplicate detection** | queue upsert `onConflict campaign_id,contact_id` (engine:200) | ⚠️ NULL contact_id (CSV) not deduped — Stage 3 |
| **Exports** | `RecipientDrawer.handleExportCSV` | client-side, from the in-browser estimate array (not a DB resolver) |
| **Campaign cloning** | not implemented ("Duplicate coming soon", BroadcastBuilder:887) | no resolver |
| **CSV import** | `csv-import.service.ts` / `csv-processor.service.ts` | parses upload → contacts stored in `audience.filters.csvFile`; resolved through A/B csv branch (a *source*, not a separate resolver) |
| **Drafts** | `/api/broadcast/campaign` POST | persists audience definition only; no resolution |
| **Templates** | template cache / parser | not a recipient resolver |

### A.6 Verdict
**No hidden post-launch re-resolver exists** — the worker and all post-launch routes read persisted rows. The problem is entirely at/before launch: **two divergent resolvers (A vs B), three A-consumers, two launch routes, and a scheduler that re-resolves at dispatch — and the send never reads the `broadcast_campaign_recipient_cache` snapshot that the preview writes.** The snapshot table exists but is used only as a transient preview cache (delete+rewrite every estimate), never as the frozen source of truth for sending.

---

## Part B — Correctness Lockdown — pre-stage report

**Objective:** every campaign generates a **frozen recipient snapshot at lock time**; that snapshot is the only source of truth for send/retry/analytics/progress; the worker never re-resolves; and launch fails unless `selected == snapshot == queued`.

### Root cause
The send path re-resolves the audience (`launchCampaign` → Resolver A) instead of consuming the frozen preview snapshot the user approved (Resolver B → `broadcast_campaign_recipient_cache`). Preview and send are two different resolvers; the scheduler re-resolves at dispatch; the cache is transient, not frozen.

### Files involved
- `src/lib/broadcast/services/broadcast-engine.service.ts` (launchCampaign: enqueue from frozen snapshot + invariant check)
- `src/lib/broadcast/services/broadcast-recipient.service.ts` (add `freezeSnapshot()`; stop clobbering frozen rows)
- `src/app/api/broadcast/launch/route.ts` + `src/app/api/broadcasts/send/route.ts` (freeze before enqueue)
- `src/lib/broadcast/services/scheduler.service.ts` (freeze at SCHEDULE time, not dispatch)
- New migration (below).
- New test file `tests/broadcast-snapshot-invariant.test.ts`.

### Why the existing implementation is incorrect
`selected` (preview, Resolver B), `queued` (send, Resolver A), and — for scheduled sends — the dispatch-time re-resolution are three independently-computed sets that are only *coincidentally* equal today. Any data change (a new lead, an opt-out, an edited tag) between preview and send, or any divergence between A and B, changes who actually receives the broadcast. There is no enforced `selected == queued` invariant, so a mismatch is silent.

### Why the new implementation is safer
One frozen snapshot, written once at lock time, read by the enqueue step and by every downstream consumer. `selected == snapshot == queued` becomes a launch-time assertion that **fails the launch on mismatch** rather than sending the wrong set. Send becomes deterministic and independent of later data changes. The worker already only reads `broadcast_queue`, so no worker change is needed for the "never re-resolve" rule — it's already true and will be locked by tests.

### Database migration required (YES)
```sql
-- Freeze flag so the transient preview-cache rewrite can't clobber a locked snapshot,
-- and the campaign records its frozen recipient count for the invariant check.
ALTER TABLE broadcast_campaign_recipient_cache
  ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS recipient_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snapshot_recipient_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_recipient_cache_frozen
  ON broadcast_campaign_recipient_cache(campaign_id, frozen, status);
```
(Full, reviewed SQL will be provided inline before it is applied — per your "paste SQL inline" rule. The preview-cache delete+rewrite in `resolveBroadcastAudience` will be scoped to `frozen = false` so it can never touch a locked snapshot.)

### Backwards compatibility / breaking changes
- **No breaking API changes.** `resolveAudience` / `resolveBroadcastAudience` signatures unchanged (still used for pre-launch estimates).
- **Behavior change (intended):** the send set is now the frozen snapshot, not a fresh resolve. For an unedited campaign the set is identical; the difference only appears when data changed between preview and launch — which is exactly the bug being closed.
- **Scheduled campaigns:** recipients freeze at schedule time (new, correct) instead of dispatch time. This is a deliberate semantic change; it will be called out in the UI copy and covered by a test.
- Resolver unification (old Stage 2) is **deferred** until after the invariant holds, per your instruction.

### Deterministic verification (tests to add — every one asserts the invariant)
`tests/broadcast-snapshot-invariant.test.ts`, each proving **Selected IDs == Snapshot IDs == Queue IDs == Delivered IDs**:
Select 1 · Select 5 · Select 50 · Select 500 · Select filtered · Search-then-select · Pagination · Select All · Deselect All · Include+Exclude · Dynamic audience · Manual audience · Mixed audience · Scheduled launch · Retry · Cancel · Resume · **plus** a mismatch-injection test proving a forced `selected != queued` **fails the launch**.

### Permanent regression policy (adopted going forward)
Every bug fixed in this rebuild gets a permanent test that fails if the bug returns. Customer-reported bugs already in memory get named regression tests:
- `hello_world` sample template 0-sends (#131058) → already covered; keep.
- "select 50 → sends to everyone" → the invariant suite above is its permanent guard.
- Recipient placeholder-name ("there") → existing `no-placeholder-name-regression.test.ts` (currently red on an untouched route — to be fixed in Stage 4).

### Validation gate (before this stage is declared done)
`tsc` · broadcast suite · full `vitest run` · lint delta · regression sweep across the module · the new invariant suite green. No proceed to resolver unification until all pass.
```
