// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED — legacy direct-send path (removed 2026-06-25)
// ═══════════════════════════════════════════════════════════════════════════
// This module used to contain `processCampaign()` (a 500-recipient-capped,
// Vercel fire-and-forget sender) and `enqueueBroadcast()`. Both were dead code
// with zero callers and a silent MAX_RECIPIENTS=500 truncation footgun.
//
// The live broadcast pipeline is now:
//   • enqueue:  BroadcastEngineService.launchCampaign()  → broadcast_queue
//   • drain:    worker.ts → BroadcastEngineService.processTenantQueue()
//               (per-tenant parallel lanes, token-bucket paced, tier-aware)
//   • backstop: /api/broadcast/process-queue → processQueue()
//
// Nothing should import from this file. It is kept only as a tombstone so the
// removal is greppable in history.
// ═══════════════════════════════════════════════════════════════════════════

export {};
