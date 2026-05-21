import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

const META_BASE = 'https://graph.facebook.com/v21.0';

export async function GET() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_business_account_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_business_account_id) {
      return NextResponse.json({ success: true, data: [] });
    }

    const apiKey = decryptToken(tenant.wa_access_token as string);
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Failed to decrypt access token' }, { status: 500 });
    }

    const res = await fetch(
      `${META_BASE}/${tenant.wa_business_account_id}/message_templates?limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      console.error('Meta templates list error:', res.status, errText.slice(0, 200));
      return NextResponse.json({ success: false, error: 'Failed to fetch templates from Meta' }, { status: 502 });
    }

    const json = await res.json();
    const raw: Record<string, any>[] = json.data || [];

    const data = raw.map((t) => ({
      id: (t.id as string) || '',
      name: (t.name as string) || '',
      category: (t.category as string) || '',
      language: (t.language as string) || '',
      status: (t.status as string) || '',
      components: (t.components as unknown[]) || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_business_account_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_business_account_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not yet active for your account. Contact support.' }, { status: 400 });
    }

    const apiKey = decryptToken(tenant.wa_access_token as string);
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Failed to decrypt access token' }, { status: 500 });
    }

    const body = await request.json();

    const res = await fetch(`${META_BASE}/${tenant.wa_business_account_id}/message_templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        name: body.name as string,
        category: (body.category as string) || 'MARKETING',
        language: (body.language as string) || 'en',
        components: body.components || [],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = json.error?.message || `Error ${res.status}`;
      return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: json });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
