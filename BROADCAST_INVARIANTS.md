# Broadcast Invariants — the contract

These invariants are enforced in code and proven by `tests/broadcast-snapshot-invariant.test.ts` (20 tests) and the wider broadcast suite. **Any change to the broadcast module must keep every one of these true.** If you are about to add a code path that turns an audience into recipients, or that inserts into `broadcast_queue`, stop and re-read this file.

## Core invariants

1. **The snapshot is immutable.** At lock time a frozen recipient set is written to `broadcast_campaign_recipient_cache` (`frozen = true`) with a `snapshot_id`, `snapshot_version`, and content `snapshot_hash`. Once written it is never mutated. The preview cache (`frozen = false`) is the only thing the estimate path may delete/rewrite.

2. **The queue derives ONLY from the snapshot.** The sole writer of `broadcast_queue` is `BroadcastEngineService.lockCampaignAndEnqueue` (`broadcast-engine.service.ts`). Queue rows are built from the read-back snapshot, never from a live re-resolve.

3. **The worker never resolves an audience.** `processQueue` / `processTenantQueue` / `processItemsForTenant` read `broadcast_queue` and send. They never call `AudienceEngineService` or `BroadcastRecipientService`.

4. **The scheduler never resolves an audience itself.** `SchedulerService.checkAndDispatchScheduled` CAS-claims a due campaign and calls `launchCampaign` — the same single lock pipeline. Locking happens at *execution*, not at schedule time.

5. **Retry never resolves an audience.** `retry-now` and the in-loop backoff re-send existing `broadcast_queue` rows; they never re-resolve.

6. **Analytics/progress/exports read persisted rows.** Counts and dashboards read `broadcast_queue` / `broadcast_deliveries` / `broadcast_analytics`. They never re-resolve. (Pre-launch preview/estimate/readiness MAY resolve — they never touch the queue or the frozen snapshot.)

7. **Selected == Snapshot == Queue == Delivered.** The lock asserts `Selected == Snapshot` (write integrity + hash self-check) and `Snapshot == Queue` (enqueue integrity) before committing. The worker sends exactly the queue rows, so Delivered ⊆ Queue and, on full drain, `Delivered == Queue`.

8. **One active snapshot per campaign.** The lock's clean-slate step deletes any prior frozen snapshot before writing. Editing the audience/tags/filters/CSV of a non-`draft`/`scheduled` campaign is rejected (`campaign/route.ts`, HTTP 409) — never silently regenerated.

9. **No duplicate enqueue.** A recipient appears in the queue at most once per campaign (keyed by `contact_id`, or by phone for CSV rows with null `contact_id`). Verified by the `Snapshot == Queue` count+set check.

10. **Launch is idempotent.** A second launch of an already-`sending`/`launching` campaign is rejected by the CAS status guard; it creates no second snapshot and no duplicate queue.

11. **A failed lock sends zero messages.** Any invariant failure (or DB error) during the lock aborts: the partial queue and the frozen snapshot are deleted and the campaign returns to `draft`. Because queue rows are inserted while the campaign is still `launching`, and the worker guard refuses to dispatch any row whose campaign is not `sending`, nothing can leak out during the lock window.

## Where each invariant lives

| Invariant | Enforced in |
|---|---|
| 1, 2, 7, 8, 9, 11 | `broadcast-engine.service.ts` → `lockCampaignAndEnqueue` |
| 3, 5, 6 | worker / retry / stats routes read persisted rows (verified by audit) |
| 4 | `scheduler.service.ts` → `launchCampaign` |
| 8 (edit rejection) | `app/api/broadcast/campaign/route.ts` POST guard |
| 10, 11 (guard) | `launchCampaign` CAS + `processItemsForTenant` worker guard |

## The one write-path to the queue

```
audience definition (broadcast_audiences)
        │
launchCampaign  ── resolve once ──▶ AudienceEngineService.resolveAudience
        │
lockCampaignAndEnqueue
   ├─ write frozen snapshot (broadcast_campaign_recipient_cache, frozen=true)
   ├─ assert Selected == Snapshot  (+ hash)
   ├─ INSERT broadcast_queue  ◀── the ONLY queue writer
   ├─ assert Snapshot == Queue
   └─ commit status → 'sending'   (worker guard blocks dispatch until here)
```

Every launch entrypoint (`/api/broadcast/launch`, `/api/broadcasts/send`) and the scheduler funnel through `launchCampaign`. There is no other path from an audience to the queue.
