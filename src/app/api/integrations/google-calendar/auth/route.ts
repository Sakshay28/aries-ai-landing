import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getGoogleAuthUrl } from '@/lib/integrations/google-calendar';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = getGoogleAuthUrl(tenantId);
  return NextResponse.redirect(url);
}
