import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/meta/service';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

export async function POST(req: NextRequest) {
  try {
    const { accessToken, phoneNumberId } = await req.json();

    if (!phoneNumberId) {
      return NextResponse.json(
        { success: false, error: 'Phone Number ID is required' },
        { status: 400 }
      );
    }

    let finalToken = accessToken;

    if (!accessToken || accessToken === '••••••••') {
      const tenantId = await getTenantId();
      if (!tenantId) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }

      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token')
        .eq('id', tenantId)
        .single();

      if (!tenant?.wa_access_token) {
        return NextResponse.json(
          { success: false, error: 'Access token is required' },
          { status: 400 }
        );
      }

      const decrypted = decryptToken(tenant.wa_access_token);
      if (!decrypted) {
        return NextResponse.json(
          { success: false, error: 'Failed to decrypt stored access token' },
          { status: 500 }
        );
      }
      finalToken = decrypted;
    }

    const result = await testConnection(finalToken, phoneNumberId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
