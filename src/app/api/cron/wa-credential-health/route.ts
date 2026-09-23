// ═══════════════════════════════════════════════════════════
// /api/cron/wa-credential-health — daily WhatsApp reachability sweep
// ═══════════════════════════════════════════════════════════
// For every tenant with WhatsApp configured, asks Meta whether the stored
// access token can still see the phone number it sends from, and records the
// answer in wa_credential_health (alerting on any healthy → broken flip).
//
// The send path already reports credential faults the instant a real message
// fails, which is faster. This sweep exists for the case that actually bit us:
// a LOW-TRAFFIC tenant. Globesome averaged well under one conversation a day,
// so "wait for a send to fail" meant the outage could sit undetected for days
// at a time even after a send failure was correctly classified. A daily probe
// bounds detection at 24h no matter how quiet a tenant is.
//
// Read-only against Meta: GET /{phone_number_id} exercises the same asset
// permission a send does, without the ability to message anyone.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { probeWhatsAppCredentials } from '@/lib/whatsapp/credentialHealth';
import { reportCredentialFault, reportCredentialOk } from '@/lib/whatsapp/credentialHealth.server';

export const maxDuration = 60;

// Budget guard — same lesson as the follow-up cron that 504'd for three days:
// never start work we can't finish inside maxDuration. Tenants not reached on
// this tick keep their previous state and are picked up tomorrow (or sooner,
// by a live send failure).
const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name, wa_phone_number_id, wa_access_token')
    .not('wa_phone_number_id', 'is', null);

  if (error) {
    console.error('[wa-health] tenant query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let checked = 0;
  let ok = 0;
  let broken = 0;
  let skipped = 0;
  let unconfigured = 0;
  const brokenTenants: { tenant: string; fault: string }[] = [];

  for (const t of tenants ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      console.warn(`[wa-health] time budget reached after ${checked} tenants — remainder deferred to next run`);
      break;
    }

    // Only probe tenants that are actually SET UP. A half-configured or
    // never-onboarded tenant (blank phone number ID, no token at all) has never
    // been able to send, so calling it an outage would email every day about a
    // client who hasn't launched — exactly the noise that makes a real alert
    // easy to ignore. "Social Outfitters Hospitality Pvt Ltd" is one of these:
    // active row, blank phone number ID, zero messages ever.
    // The send path still catches misconfiguration, because an attempted send
    // is proof the tenant was meant to be live.
    const configuredPhoneId = String(t.wa_phone_number_id ?? '').trim();
    if (!configuredPhoneId || !t.wa_access_token) {
      unconfigured++;
      continue;
    }

    let token: string | null = null;
    try {
      token = decryptToken(t.wa_access_token as string | null);
    } catch {
      token = null; // probe reports this as a credential fault below
    }

    const result = await probeWhatsAppCredentials(token, configuredPhoneId);
    checked++;

    if (result.ok) {
      ok++;
      await reportCredentialOk({
        tenantId: t.id as string,
        businessName: t.business_name as string | null,
        phoneNumberId: configuredPhoneId,
      });
      continue;
    }

    if (!result.fault) {
      // Network blip or an unrecognised error — deliberately does NOT flip the
      // tenant to 'broken'. A false "you are offline" banner is worse than a
      // day's delay, and the next run (or a real send failure) will settle it.
      skipped++;
      console.warn(`[wa-health] inconclusive for ${t.business_name}: ${result.detail ?? 'unknown'}`);
      continue;
    }

    broken++;
    brokenTenants.push({ tenant: (t.business_name as string) || (t.id as string), fault: result.fault.kind });
    await reportCredentialFault({
      tenantId: t.id as string,
      businessName: t.business_name as string | null,
      phoneNumberId: configuredPhoneId,
      fault: result.fault,
      detail: result.detail,
    });
  }

  const summary = { checked, ok, broken, skipped, unconfigured, brokenTenants, ms: Date.now() - startedAt };
  console.log('[wa-health] sweep complete:', JSON.stringify(summary));
  return NextResponse.json({ success: true, ...summary });
}
