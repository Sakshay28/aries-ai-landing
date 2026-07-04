import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

// Temporary diagnostic — remove after platform send is confirmed working
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('s');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'no' }, { status: 401 });
  }

  const phoneNumberId = process.env.PLATFORM_WA_PHONE_NUMBER_ID;
  const envSet = Boolean(phoneNumberId);

  let dbRow: string | null = null;
  let tokenDecrypts = false;
  let metaTestStatus: number | null = null;

  if (phoneNumberId) {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token')
      .eq('wa_phone_number_id', phoneNumberId)
      .maybeSingle();

    dbRow = data ? 'found' : 'not_found';

    if (data?.wa_access_token) {
      const token = decryptToken(data.wa_access_token);
      tokenDecrypts = Boolean(token);

      if (token) {
        // Quick test send to a safe number (will likely be rejected by Meta but we see the status)
        try {
          const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp', recipient_type: 'individual',
              to: '919875152290', type: 'template',
              template: {
                name: 'staff_keepalive', language: { code: 'en' },
                components: [{ type: 'body', parameters: [{ type: 'text', text: 'Aries AI' }] }],
              },
            }),
            signal: AbortSignal.timeout(10000),
          });
          metaTestStatus = res.status;
        } catch (e) {
          metaTestStatus = -1;
        }
      }
    }
  }

  return NextResponse.json({ envSet, phoneNumberId, dbRow, tokenDecrypts, metaTestStatus });
}
