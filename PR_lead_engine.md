## Fix: leads stuck at "New" — restore deterministic scoring, score imports, unblock the worker

### Why
Almost every lead sat at `lead_status='new'` / `lead_score=0` forever. A read-only production probe pinned it down (it was **not** a missing-migration or broken-queue problem):

| Check | Prod result |
|---|---|
| Migrations applied | ✅ `ai_jobs` (2,794), `lead_signal_events` (3,103), `lead_status_history` (584), all new `leads` columns present |
| Worker draining | ✅ 2,776 done, 0 pending/failed — **but 18 stuck in `processing`** |
| **Leads frozen** | 🔴 **1,486 / 1,492 leads `new` (99.6%), 1,050 at score 0 (70%), 0 hot/warm/qualified** |

Three concrete defects, all fixed here.

### What changed

**1. Restored the deterministic scoring engine** (`f714897`)
The Jul 2 "enterprise rebuild" (`a13af6e`) had replaced `calculateLeadScore` with a lean 14-signal heuristic and left `INTEREST_PATTERNS` + industry modules as **dead code** — dropping ~42 deterministic buying-intent / industry / data-sharing signals and the score→status derivation. That's why leads never moved off `new`. Recovered the pre-rebuild rich engine (from `a13af6e^`), re-applied the enterprise interface widenings so `decision-engine` / `conversation-intelligence` / the webhook still compile, merged `manual_override`/`manual_stage` handling, and re-added the enterprise-only relationship/lifecycle signals (`returning_customer`, `repeated_visits`, `ghosted_14_days`, spam/duplicate/cancelled) as non-conflicting extras. `deriveAutoStatus` now maps score→status with the qualification gate (QUALIFIED needs an explicit closing signal).

**2. Cold-start scorer for imported / conversation-less leads** (`f714897`, `737469e`)
The whole engine is conversation-gated, so imported contacts (no messages) could never be scored. New `src/lib/scoring/cold-start.ts` computes a deterministic baseline from metadata (name/email/source + a multi-language intent scan of `notes`), wired into the CSV import route. Caps at `hot` (never auto-qualify from metadata); opt-out → `lost`, spam → `cold`. Plus an admin backfill endpoint (`/api/admin/backfill-coldstart`) for the ~1,050 pre-existing score-0 imports — **dry-run by default**, writes only with `?apply=true`.

**3. Worker reclaims stuck `processing` jobs** (`3db8e3c`)
The worker only fetched `pending`/`retry` and never reclaimed timed-out claims. A job whose function hit the Hobby 10s cap stayed `processing` forever and — via the `idx_ai_jobs_pending_conv` one-active-job-per-conversation unique index — **permanently blocked all future scoring for that conversation** (the 18 orphans). Now requeues `processing` jobs older than 3 min (or dead-letters once retries are exhausted). Self-heals on next run.

**4. Decision-engine V2 hardening** (`290a887`)
The V2 path took `v2.stage` as the final status, bypassing the rule-score floor and the qualification gate — letting Gemini alone stamp a lead `qualified`. Reworked to mirror the V1 guarantees: `composite = max(ruleScore, v2.score)` (AI lifts, never lowers), qualified requires a closing signal **and** score ≥ 90, and status comes from score-based `deriveStatus`. Gemini's stage is kept only in the reasoning string.

### Verification
- `tsc --noEmit`: **0 errors**
- Changed files: **lint-clean**
- Tests: **237 pass** (up from **126 failing**) — 176 scoring + 14 cold-start + 47 decision/integration (incl. 4 new V2-path tests)

### Required after merge (prod, manual)
- [ ] **pg_cron** — schedule `drain-ai-scoring` every 2 min (Hobby fires it only daily). Mirrors the existing `drain-automations` job.
- [ ] **Backfill existing leads** — `POST /api/admin/backfill-ai-scoring` (conversation leads) and `POST /api/admin/backfill-coldstart` (dry-run, then `?apply=true`) for no-conversation imports.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
