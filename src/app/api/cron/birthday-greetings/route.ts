// ═══════════════════════════════════════════════════════════
// 🎂 Birthday Greeting Automation
// Runs daily. Finds leads whose birthday is today and sends a
// warm WhatsApp greeting (optionally with the tenant's offer).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { greetingFirstName } from '@/lib/utils/contact-name';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-12
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();

  // Filter at DB level: birthday column is DATE (YYYY-MM-DD).
  // Use a LIKE pattern matching the MM-DD suffix — efficient and avoids loading all PII.
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const { data: todays } = await supabaseAdmin
    .from('leads')
    .select('id, tenant_id, name, phone, birthday, last_birthday_greeted_year')
    .not('phone', 'is', null)
    .like('birthday', `%-${mmdd}`)           // matches any YYYY-MM-DD ending in today's MM-DD
    .neq('last_birthday_greeted_year', year)  // not already greeted this year
    .limit(500);                              // hard cap — safety valve

  if (!todays || todays.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Group by tenant
  const byTenant = new Map<string, typeof todays>();
  for (const l of todays) {
    const arr = byTenant.get(l.tenant_id) || [];
    arr.push(l);
    byTenant.set(l.tenant_id, arr);
  }

  let sent = 0;

  for (const [tenantId, leads] of byTenant) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('business_name, wa_access_token, wa_phone_number_id, welcome_offer')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) continue;
    const token = decryptToken(tenant.wa_access_token as string);
    if (!token) continue;
    const phoneId = tenant.wa_phone_number_id as string;
    const bizName = (tenant.business_name as string) || 'us';
    const offer = (tenant.welcome_offer as string) || '';

    for (const l of leads) {
      const firstName = greetingFirstName(l.name);
      const offerLine = offer ? `\n\nHere's a little something from us: ${offer} 🎁` : '';
      const msg = `🎂 Happy Birthday, ${firstName}! Wishing you a wonderful day from all of us at ${bizName}.${offerLine}`;

      try {
        await sendTextMessage(token, phoneId, l.phone, msg);
        await supabaseAdmin
          .from('leads')
          .update({ last_birthday_greeted_year: year })
          .eq('id', l.id);
        sent++;
      } catch (e) {
        console.error(`🎂 Birthday greeting failed for lead ${l.id}:`, (e as Error).message);
      }
    }
  }

  console.log(`🎂 [birthday-greetings] sent=${sent}`);
  return NextResponse.json({ ok: true, sent });
}
