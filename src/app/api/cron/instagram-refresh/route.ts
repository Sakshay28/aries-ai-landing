import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import axios from 'axios';
import { decryptToken, encryptToken } from '@/lib/utils/crypto';

export async function GET(req: NextRequest) {
  // Simple auth to prevent unauthorized triggers
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all tenants with active IG configurations
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('id, ig_access_token')
      .not('ig_access_token', 'is', null)
      .eq('is_active', true);

    if (error) throw error;
    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ success: true, message: 'No active IG tokens to refresh' });
    }

    let refreshed = 0;
    let failed = 0;

    // Refresh each token
    for (const tenant of tenants) {
      try {
        const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: decryptToken(tenant.ig_access_token),
          },
        });

        const newToken = response.data.access_token;
        
        if (newToken) {
          await supabaseAdmin
            .from('tenants')
            .update({ ig_access_token: encryptToken(newToken) })
            .eq('id', tenant.id);
          refreshed++;
        }
      } catch (err) {
        console.error(`❌ Failed to refresh IG token for tenant ${tenant.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'IG Token refresh complete',
      stats: { refreshed, failed, total: tenants.length }
    });

  } catch (error) {
    console.error('❌ IG Token Cron Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
