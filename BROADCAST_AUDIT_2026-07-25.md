# Broadcast System — Production Engineering Audit (2026-07-25)

Principal-engineer audit of the entire broadcast module. This report is **evidence-based**: every finding below cites the file and line I verified. Where I could not verify something from code alone (runtime/ops facts), it is marked **[NEEDS OPS CONFIRMATION]** rather than asserted.

Scope read end-to-end: UI selection (`AudienceBuilder`, `ContactPickerDrawer`, `RecipientDrawer`, `BroadcastBuilder`) → save (`/api/broadcast/campaign`) → persist (`broadcast_audiences`) → launch (`/api/broadcast/launch`) → resolve (`AudienceEngineService` + `BroadcastRecipientService`) → enqueue (`broadcast_queue`) → drain (`worker.ts` + `BroadcastEngineService.processItemsForTenant`) → Meta.

---

## 0. Three premises in the brief that do NOT match the real system

These reframe a large part of the requested work. Correcting them first so effort isn't spent auditing things that don't exist.

1. **There is no BullMQ / Redis broker in the live broadcast path.** `src/lib/broadcast/queue.ts` is a tombstone (`export {}`). The real queue is a **Postgres table** (`broadcast_queue`) drained by a long-lived Node process (`worker.ts`, `Dockerfile.worker`) plus a Vercel cron backstop. So "audit BullMQ concurrency / stalled jobs / Redis reconnect / dead-letter broker" is **not applicable**. (A DLQ *table* does exist via `pushToDLQ`.) The correctness properties you want — idempotency, retries with backoff+jitter, exactly-once — must be evaluated against the SQL queue, which is what this report does.

2. **Consent is intentionally NOT enforced for template sends** (`audience-engine.service.ts:216-219`, `broadcast-recipient.service.ts:302-304`). That is *correct* per WhatsApp policy (approved templates may go to any valid number; Meta governs at delivery). It is not a bug. **However**, the estimate UI still renders a "No Consent — blocked" breakdown panel (`AudienceBuilder.tsx:809-816`) that the engine never produces (`noConsentRemoved` is always 0). That is a UI/engine mismatch, not a compliance hole.

3. **"Selection sends to everyone" is architectural, not a race condition.** It is caused by how the audience is modeled, not by React re-renders or optimistic UI. Root cause in §1.

---

## 1. CRITICAL — Recipient selection is non-deterministic *by construction*

This is your #1 issue and it is real. The mechanism is precise and reproducible.

### 1.1 Root cause: audience = `base cohort ± partial override sets`, and the overrides only ever see the loaded subset

The audience is stored as three things (`AudienceState`):
- `type` — the **base cohort** (`all` / `tags` / `custom` / `recent` / `manual` / `csv` / `retarget`)
- `manualContactIds` — contacts **added on top** of the base
- `excludedContactIds` — contacts **removed** from the base

Both resolvers apply `manualContactIds` **additively, regardless of `type`**:
- `AudienceEngineService.resolveAudience` (the real send path) — `audience-engine.service.ts:147-155`
- `BroadcastRecipientService.resolveBroadcastAudience` (the estimate path) — `broadcast-recipient.service.ts:131-145`

There is **no primitive that means "the audience is exactly these IDs."** "Manual" selection is expressed as `base + additions − exclusions`, and the `RecipientDrawer` is available from the footer on **every** audience type (`BroadcastBuilder.tsx:1047`).

**Reproduction of "hand-pick 50, sends to everyone":**
1. Default `type = 'all'` (`BroadcastBuilder.tsx:47-51`). Estimate resolves to *all* contacts; every resolved row has `source_type = 'all'` (non-manual).
2. User opens the RecipientDrawer intending to keep ~50. In the drawer, a **non-manual** row toggles **exclusion** (`RecipientDrawer.tsx:89-109` — `isManual ? manual : excluded`). To keep 50 out of 5,000 you must *exclude* 4,950.
3. `handleDeselectAll` only excludes `allListItems` — the currently **filtered/loaded** rows (`RecipientDrawer.tsx:208-223`). Anything not loaded is neither excluded nor manual.
4. At launch, `AudienceEngineService` re-fetches the base (`type = 'all'` → **everyone**) and removes only the `excludedContactIds` that were actually recorded. Everyone the drawer never loaded is still in. → **sends to almost everyone.**

### 1.2 Secondary determinism defects (all confirmed)

- **S2 [HIGH]** `handleSelectAll` / `handleDeselectAll` operate on `allListItems` (filtered/visible), but the sticky count and Apply use the full `temp*` sets (`RecipientDrawer.tsx:189-223, 268-291`). → the "selected" number **changes when you switch the filter tab or type in search**, exactly as reported ("selected count changes automatically", "search selection behaves differently").
- **S3 [MED]** `ContactPickerDrawer` fetches `limit: '1000'` and filters VIP **client-side** (`ContactPickerDrawer.tsx:67-95`). "Select All on Page" and "Select Newest 50" (`:114-125, :285-292`) act on ≤1000 loaded rows. For a tenant with >1000 contacts, Select-All silently covers only the first 1000. Selection keyed correctly by `id` (good), but bounded by the fetch.
- **S4 [MED]** `AudienceBuilder`'s picker `onApply` sets `manualContactIds` but **not** `type: 'manual'` (`AudienceBuilder.tsx:1034-1039`). Works today only because the picker button is gated behind the manual tab (`:993`). Fragile — any future entry point re-introduces the §1.1 bug directly.
- **S5 [LOW]** `excludedContactIds` is `(audience as any).excludedContactIds` in one resolver (`broadcast-recipient.service.ts:158`) and typed in the other — the field isn't consistently on `AudienceState` (`AudienceBuilder.tsx:16-26` omits it; `types/index.ts` should be the single source).

### 1.3 The fix (enterprise pattern — matches WATI / AiSensy / Interakt)

**Freeze the audience to an explicit, server-resolved recipient snapshot at lock time, then send exactly that snapshot.** Concretely:

1. Add an explicit selection mode to `AudienceState`: `selection: { mode: 'dynamic' } | { mode: 'explicit'; contactIds: string[] }`. "Select Contacts" and any drawer hand-editing produce `mode: 'explicit'` with the **complete** id set (server-side "select all matching filter" returns *all* ids, not a page).
2. At **launch (lock) time**, resolve once to a concrete list and write it to `broadcast_campaign_recipient_cache` (this table **already exists** and `resolveBroadcastAudience` already writes it — `broadcast-recipient.service.ts:345-368`). Mark the campaign `locked`.
3. `launchCampaign` must **read the frozen snapshot** and enqueue exactly the `eligible` rows — **not** re-resolve `base ± overrides` via `AudienceEngineService` (`broadcast-engine.service.ts:150-161`). Today the snapshot and the send path are two different code paths that can disagree; that divergence is the bug's home.
4. Delete the additive-merge branch entirely; `explicit` mode means "exactly these," `dynamic` mode means "the filter, resolved at lock time." No third hybrid.

This also collapses the **two-resolver architecture** (a long-standing footgun already noted in memory `feedback_broadcast_debugging`): the estimate and the send must be the *same* function over the *same* snapshot.

---

## 2. CRITICAL / [NEEDS OPS CONFIRMATION] — Continuous drain depends on an external worker; the only in-platform backstop runs once per day

- `worker.ts` is a well-built persistent per-tenant-lane drain (token-bucket paced, tier-aware, heartbeat, stall watchdog, graceful shutdown). It is designed to run on Railway/Render/Fly/EC2 (`Dockerfile.worker`).
- The **only** Vercel drain is the cron `POST /api/broadcast/process-queue`, scheduled `0 6 * * *` — **once a day** (`vercel.json`). `launch/route.ts:171-185` also fires one inline 20-message batch + one cron poke via `after()`.

**Implication:** if `worker.ts` is not deployed / has crashed / the host is down, a campaign gets its inline 20 sent at launch, then **nothing until 06:00 the next day**, one batch at a time. This is the most likely cause of "broadcasts stop midway / jobs disappear." This exact class of failure (sub-daily crons silently failing on Hobby plans) is already documented in memory (`project_staff_alerts_delivery`, `project_lead_engine_coldstart`).

**Actions:** (1) Confirm the worker is actually deployed and its `worker_heartbeats` row is fresh. (2) Add a health surface for it in the dashboard (heartbeat age). (3) Raise the backstop cron frequency (every 1–5 min) so a worker outage degrades to "slow," not "stuck."

---

## 3. HIGH — Plan recipient cap is effectively bypassed; scheduled campaigns record 0 recipients

`launch/route.ts:96` reads `campaign.audience_count` to enforce the plan cap **before** resolution. But:
- The save path never writes `campaign.audience_count`; it writes `contact_count: 0` into `broadcast_audiences` (`campaign/route.ts:214`).
- `campaign.audience_count` is only set **inside** `launchCampaign`, *after* the cap check already passed (`broadcast-engine.service.ts:209`).

So for any new campaign the cap sees `0` and always allows (`checkBroadcastCap(plan, 0)`). And the **scheduled** branch writes `total_recipients: campaign.audience_count || 0` → scheduled campaigns show **0 recipients** until they actually send (`launch/route.ts:123`).

**Fix:** compute and persist `audience_count` at save/estimate time (the estimate already returns `totalRecipients`), and enforce the cap against the freshly-resolved snapshot count in §1.3, not a stale column.

---

## 4. MEDIUM — Idempotency gap for CSV / manual-null recipients

Enqueue dedupe relies on `upsert(..., { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })` (`broadcast-engine.service.ts:198-201`). CSV contacts are enqueued with `contact_id: null` (`:176-181`). In Postgres, `NULL` values are **distinct** in a unique index (unless `NULLS NOT DISTINCT`), so:
- Two CSV rows with the same phone but `contact_id = null` do **not** conflict → a re-launch or double-drain can enqueue duplicate sends to a CSV/manual number.

**Fix:** add a generated dedupe key (e.g. `coalesce(contact_id::text, 'phone:'||phone)`) and make the unique constraint / conflict target use it; or dedupe on normalized phone within the campaign before insert. (Migration required — SQL to be provided inline once direction is chosen.)

---

## 5. MEDIUM — `resolved.total === 0` silently completes the campaign

`launchCampaign` marks a campaign `completed` with 0 sent when resolution yields zero (`broadcast-engine.service.ts:163-169`). The prior swallow-to-zero bug was correctly fixed (errors now propagate — good, see the comments at `audience-engine.service.ts:22-31`). But a **mis-saved explicit audience** (empty `manualContactIds`, or a filter that matches nothing) still silently completes with no sent and no warning. Once the §1.3 snapshot lock exists, launch should **reject** a zero-recipient lock with an actionable error rather than mark success.

---

## 6. Analytics / progress — dual counter systems, reconciliation needed

There are two counter mechanisms in the send path: `increment_campaign_counter` (used for `sent` and `failed`, `:791, :920`) and `increment_broadcast_analytics` (used only for `failed_count`, `:916`). Delivered/Read come from webhooks into `broadcast_analytics`. Memory (`project_broadcast_delivered_read_analytics_2026-07-23`, `project_broadcast_campaign_insights_2026-07-23`) already documents the UI having read dead `broadcast_campaigns` columns and a fabricated 30-day fallback. **Recommendation:** one source of truth (`broadcast_analytics`), one increment RPC, and every UI number reads from it. Full analytics correctness pass is a separate workstream (§10 roadmap).

---

## 7. What is genuinely solid (do not rewrite)

Credit where due — these are already enterprise-grade and should be preserved:
- **Retries**: bounded exponential backoff ladder `[1,5,15,30,60]` min, separate finite throttle budget (`MAX_THROTTLE_ATTEMPTS = 20`), permanent-error fast-fail, DLQ on terminal failure (`broadcast-engine.service.ts:807-924`). This is the fruit of the 2026-07-17/07-25 hardening and is well-reasoned.
- **Concurrency**: `.eq('status','processing')` guards on every failure-path write prevent cancelled-row clobbering (`:842, :877, :895`); CAS-claim `draft→launching` prevents double-launch (`:65-96`); `resetStaleProcessing` + `reconcileFinishedCampaigns` recover crashed/orphaned runs (`:334-437`).
- **Fairness/throughput**: per-tenant lanes + token bucket + Meta 24h tier budget enforcement (`worker.ts`, `processTenantQueue:289-331`).
- **Tenant isolation**: every query filters `tenant_id`; launch is role-gated (owner/admin/manager) + rate-limited (`launch/route.ts:12-33`).
- **Meta edge cases**: `hello_world` sample-template refused server-side (`launch/route.ts:88-93`); server-side template-approval gate with on-demand sync (`broadcast-engine.service.ts:104-136`); media-header re-attached on every send (`:557-580`).

---

## 8. Not yet verified (honest gaps in this pass)

To avoid asserting beyond evidence, these were **not** read in depth and should be covered before claiming "no critical risks remain":
- `contacts/search` route tenant-scoping and the `q`/`tag` query safety.
- Scheduler DST / past-schedule / clock-drift correctness (`scheduler.service.ts`, `SchedulerService.checkAndDispatchScheduled`).
- Webhook signature verification + replay handling (`/api/broadcast/webhook`).
- CSV upload: size limits, MIME validation, formula-injection, and where `csvFile.contacts` is stored (it's persisted inside `broadcast_audiences.filters.csvFile` — potential large-JSON row bloat).
- Variable engine escaping (unicode/emoji/newlines) and the `meta-payload-builder` component ordering.
- RLS coverage on the newer broadcast tables (`broadcast_queue`, `broadcast_campaign_recipient_cache`, `broadcast_deliveries`).

---

## 9. Production-readiness score

**Correctness of the drain/send engine: 8/10** (mature, well-guarded).
**Correctness of recipient selection: 3/10** (the §1 architectural defect undermines everything upstream — the engine faithfully sends the wrong set).
**Operational reliability: unknown pending §2** — could be 8/10 (worker healthy) or 2/10 (worker down, once-daily drain).

Blended, gated on the selection defect: **~5/10, NOT production-ready for hand-picked audiences.** All-contacts and tag/recent campaigns are materially safer than manual selection today.

---

## 10. Prioritized roadmap

**P0 (correctness / safety):**
1. §1.3 snapshot-lock selection rebuild (explicit vs dynamic mode; one resolver; send the frozen snapshot). *Largest change; changes send semantics.*
2. §2 confirm worker is live + raise backstop cron frequency + heartbeat surfacing.
3. §3 persist & enforce real `audience_count` at the cap check.

**P1 (integrity):**
4. §4 CSV/null idempotency key (migration).
5. §5 reject zero-recipient locks.
6. §6 single analytics source of truth + reconciliation.

**P2 (hardening / the §8 gaps):**
7. Webhook signature/replay, scheduler DST, CSV upload validation, RLS coverage, variable escaping, contacts/search scoping.

**P3 (UX):**
8. Remove the phantom "No Consent blocked" panel (or wire a real metric); server-side "select all matching" count; explicit "exactly N will receive this" confirmation on the launch modal.

---

*Every code claim above is line-cited and re-verifiable. Runtime/ops items (§2) require checking the deployed worker + `worker_heartbeats` freshness.*
