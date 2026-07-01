# Guaranteed Business Delivery

Ensures a business never misses a customer event (booking, cancellation, human
handoff, payment) because their staff/manager WhatsApp 24h session window
closed. Migration: `supabase/migrations/20260701_guaranteed_business_delivery.sql`.

## Architecture — 3 tiers

**Tier 1 — Prevention.** `src/app/api/cron/session-keepalive/route.ts` (`runStaffKeepalive`)
pings every tenant's `staff_phone`/`manager_phone` whenever their session has
≤12h left, using an interactive button ("✅ Got it") rather than a passive
text — only a tap counts as an inbound message to Meta, so it reliably
reopens the window. Two safety windows per 24h cycle means one missed cron
tick can't blow through the deadline. Runs every 10 min via
`.github/workflows/platform-drain.yml`.

**Tier 2 — Session state.** `conversations` carries `last_inbound_at`,
`last_outbound_at`, `window_expires_at`, `last_template_name`,
`last_template_sent_at`, kept in sync by a trigger on every `messages` insert
(`sync_conversation_session_state()`). Applies uniformly to customer and
staff/manager phones — both get an ordinary conversation row the first time
they message the bot. Read via `getSessionState(tenantId, phone)` in
`src/lib/whatsapp/session.ts`; no row means the window has never opened
(never guessed).

**Tier 3 — Safety net.** `sendBusinessEvent()` in
`src/lib/whatsapp/businessNotify.ts` is the single entry point for every
staff/manager-facing alert. It always writes a `business_notifications` row
**before** attempting any WhatsApp send, so the business has a durable,
dashboard-visible record even if Meta is down or nobody has a fallback
template configured. Per recipient: open window → session message; closed
window → the tenant's bound template for that event type; either failing →
retried by `/api/cron/notification-retry` (exponential backoff, 5 attempts,
then escalates and stays pinned as `critical` until acknowledged).

## System events

`booking_confirmation`, `booking_reminder`, `human_assistance`,
`support_response`, `lead_follow_up`, `callback_request`, `order_update`,
`reservation_update`, `thank_you`, `payment_confirmation`, `staff_keepalive`.

## Binding a template to an event

Dashboard → Templates → an `APPROVED` template's card → "Use for system
event" dropdown. One approved template per event per tenant (enforced by a
partial unique index). Resolved at send time by
`resolveEventTemplate()` in `src/lib/whatsapp/templateManager.ts`.

## Dashboard alerts

`src/app/dashboard/_layout/BusinessNotificationBell.tsx` — Realtime-pushed
(not just polled), audible + tab-title badge for `critical` severity. Backed
by `src/app/api/dashboard/notifications/route.ts`.

## What's NOT covered

New intent detection for "customer requests a callback" or a lead-scoring
"qualified" threshold trigger don't exist yet — `sendBusinessEvent()` is
ready to be called the moment those triggers are built.
