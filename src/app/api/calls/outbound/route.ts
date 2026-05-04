import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { getTenantFromCookies } from '@/lib/auth/getTenantFromCookies';
import * as Sentry from '@sentry/nextjs';

const VOICE_SERVER_URL = process.env.VOICE_AGENT_SERVER_URL || 'http://localhost:8080';

// Per-tenant outbound-call rate limit: 30 calls / 60 seconds.
// Adjust based on real usage patterns; this prevents a compromised account
// from running up an unbounded VoBiz bill in seconds.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SEC = 60;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/calls/outbound
// Body: { phone: string; caller_name?: string }
// Triggers the Python voice agent to place an outbound call on behalf of the tenant.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantFromCookies();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve tenant + check calling plan + voice quota
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, plan, business_name, voice_calls_used_this_month, voice_call_limit')
      .eq('id', ctx.tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Only Pro / Ultra Premium plans get voice calling
    const CALLING_PLANS = ['pro', 'ultra_premium'];
    if (!CALLING_PLANS.includes(tenant.plan)) {
      return NextResponse.json(
        { error: 'AI Voice Calling is available on Pro and Ultra Premium plans. Please upgrade.' },
        { status: 403 }
      );
    }

    // Per-tenant rate limit (Redis-backed, survives server restarts).
    const rl = await checkRedisRateLimit(
      `voice:outbound:${tenant.id}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SEC
    );
    if (!rl.allowed) {
      console.warn(`⏱️ [CALLS] Rate-limited tenant=${tenant.id}`);
      return NextResponse.json(
        { error: `Too many call requests. Limit is ${RATE_LIMIT_MAX} per minute.` },
        { status: 429 }
      );
    }

    // Voice-call quota check (Ultra Premium = 150 included, Pro = 0 included
    // but billed per-call, etc.). voice_call_limit of 0 with plan='pro' means
    // pay-as-you-go; voice_call_limit > 0 enforces a hard cap.
    const limit = tenant.voice_call_limit ?? 0;
    const used = tenant.voice_calls_used_this_month ?? 0;
    if (limit > 0 && used >= limit) {
      return NextResponse.json(
        {
          error: `Voice call limit reached for this billing cycle (${used}/${limit}). Top up or upgrade your plan.`,
        },
        { status: 402 }
      );
    }

    const body = await req.json();
    const { phone, caller_name } = body;

    if (!phone || !phone.startsWith('+')) {
      return NextResponse.json(
        { error: 'Invalid phone number. Must include country code e.g. +91...' },
        { status: 400 }
      );
    }

    console.log(`📞 [CALLS] Outbound call → ${phone} (tenant: ${tenant.id}, used: ${used}/${limit || '∞'})`);

    // Forward request to the Python voice agent server
    const agentResponse = await fetch(`${VOICE_SERVER_URL}/call/outbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        tenant_id:   tenant.id,
        caller_name: caller_name || '',
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error(`❌ [CALLS] Voice server error: ${errorText}`);
      return NextResponse.json(
        { error: `Voice agent server error: ${errorText}` },
        { status: agentResponse.status }
      );
    }

    const result = await agentResponse.json();

    // Log call initiation in Supabase
    await supabaseAdmin.from('call_logs').insert({
      tenant_id:    tenant.id,
      phone_number: phone,
      caller_name:  caller_name || '',
      summary:      'Outbound call initiated',
      duration_seconds: 0,
      transcript:   '',
    });

    // Atomically increment the tenant's voice-call usage counter.
    // Uses the increment_voice_calls RPC defined in supabase_voice_migration.sql.
    // Failures here are logged but don't fail the request — the call is already
    // dispatched and we'd rather under-count than fail a user-visible action.
    const { error: rpcErr } = await supabaseAdmin.rpc('increment_voice_calls', {
      t_id: tenant.id,
    });
    if (rpcErr) {
      console.error('⚠️ [CALLS] increment_voice_calls failed:', rpcErr);
      Sentry.captureException(rpcErr);
    }

    return NextResponse.json({
      success:     true,
      dispatch_id: result.dispatch_id,
      room_name:   result.room_name,
      message:     `Call initiated to ${phone}. The AI agent will dial now.`,
    });
  } catch (error) {
    console.error('❌ POST /api/calls/outbound error:', error);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
