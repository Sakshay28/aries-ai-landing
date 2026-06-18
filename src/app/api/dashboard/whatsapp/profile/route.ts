import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

const META_BASE = 'https://graph.facebook.com/v21.0';
const PROFILE_FIELDS = 'about,address,description,email,profile_picture_url,websites,vertical';

async function getMetaCreds(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('wa_phone_number_id, wa_access_token')
    .eq('id', tenantId)
    .single();

  if (error || !data?.wa_phone_number_id || !data?.wa_access_token) {
    throw new Error('WhatsApp credentials not configured. Go to Settings → WhatsApp to add them.');
  }

  const token = decryptToken(data.wa_access_token);
  if (!token) throw new Error('Failed to decrypt access token');

  return { phoneNumberId: data.wa_phone_number_id, token };
}

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { phoneNumberId, token } = await getMetaCreds(tenantId);

    const res = await fetch(
      `${META_BASE}/${phoneNumberId}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`,
      { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' } }
    );

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? 'Meta API error' },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, data: json.data?.[0] ?? json });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { phoneNumberId, token } = await getMetaCreds(tenantId);
    const body = await req.json();

    const payload: Record<string, unknown> = { messaging_product: 'whatsapp' };
    const allowed = ['about', 'address', 'description', 'email', 'websites', 'vertical'];
    for (const key of allowed) {
      if (key in body) payload[key] = body[key];
    }

    const res = await fetch(`${META_BASE}/${phoneNumberId}/whatsapp_business_profile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? 'Meta API error' },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
